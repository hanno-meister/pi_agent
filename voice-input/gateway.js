import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { resolveVoiceConfig, validateVoiceConfig } from "./voice-config.js";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const defaultTranscriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
// Chrome targets 128 kbit/s Opus; this allows equal space again for WebM overhead.
const defaultUploadBytesPerSecond = 32_000;

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request, maxBytes, limitMessage) {
  const contentLength = Number(request.headers["content-length"]);
  if (maxBytes && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestError(413, limitMessage);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (maxBytes && bytes > maxBytes) {
      throw new RequestError(413, limitMessage);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new RequestError(415, "Expected application/json");
  }
  const body = await readBody(request, 16_384, "Request body is too large");
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new RequestError(400, "Malformed JSON request");
  }
}

async function serveAsset(response, name, contentType) {
  try {
    const body = await readFile(`${publicDirectory}${name}`);
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

async function transcribe(audio, contentType, options) {
  if (!options.apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const form = new FormData();
  form.append("model", options.model);
  form.append("language", options.language);
  form.append("file", new Blob([audio], { type: contentType }), "recording.webm");
  const response = await options.fetchImpl(options.transcriptionUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error("Voice transcription failed; check OpenAI access and try again");
  const result = await response.json();
  if (typeof result.text !== "string") {
    throw new Error("Voice transcription failed; check OpenAI access and try again");
  }
  return result.text;
}

export function createVoiceGateway(overrides = {}) {
  const voiceConfig = resolveVoiceConfig(overrides);
  const options = {
    apiKey: overrides.apiKey ?? process.env.OPENAI_API_KEY ?? "",
    fetchImpl: overrides.fetchImpl ?? fetch,
    ...voiceConfig,
    now: overrides.now ?? Date.now,
    pollTimeoutMs: overrides.pollTimeoutMs ?? 25_000,
    recorderLeaseTtlMs: overrides.recorderLeaseTtlMs ?? 15_000,
    sessionTtlMs: overrides.sessionTtlMs ?? 15_000,
    csrfTtlMs: overrides.csrfTtlMs ?? 10 * 60_000,
    transcriptionUrl: overrides.transcriptionUrl ?? defaultTranscriptionUrl,
    uploadBytesPerSecond:
      overrides.uploadBytesPerSecond ?? defaultUploadBytesPerSecond,
  };
  if (!Number.isInteger(options.uploadBytesPerSecond) || options.uploadBytesPerSecond < 1) {
    throw new Error("Upload bytes per second must be a positive integer");
  }
  const defaultSessionConfig = {
    language: options.language,
    maxDurationSeconds: options.maxDurationSeconds,
    model: options.model,
  };
  const sessions = new Map();
  const recorderConnections = new Map();
  const csrfTokens = new Map();
  let recorderLease;
  let activeRecording;

  function pruneSessions() {
    const now = options.now();
    for (const [sessionId, session] of sessions) {
      if (session.expiresAt > now) continue;
      sessions.delete(sessionId);
      session.waiter?.();
    }
  }

  function currentRecorderLease() {
    if (
      recorderLease &&
      recorderLease.expiresAt <= options.now() &&
      !activeRecording
    ) {
      recorderLease = undefined;
    }
    return recorderLease;
  }

  function issueCsrfToken() {
    const token = randomUUID();
    csrfTokens.set(token, options.now() + options.csrfTtlMs);
    return token;
  }

  function requireBrowserRequest(request) {
    const origin = request.headers.origin;
    const expectedOrigin = `http://${request.headers.host}`;
    const token = request.headers["x-csrf-token"];
    const expiresAt = csrfTokens.get(token);
    if (origin !== expectedOrigin || !expiresAt || expiresAt <= options.now()) {
      throw new RequestError(403, "Browser request was rejected");
    }
    csrfTokens.delete(token);
    csrfTokens.set(token, options.now() + options.csrfTtlMs);
  }

  function cancelRecording(recording) {
    if (activeRecording !== recording) return false;
    activeRecording = undefined;
    sendRecorderEvent(recording.recorderId, "recording-cancelled", {
      recordingId: recording.id,
    });
    return true;
  }

  function sendRecorderEvent(recorderId, event, data) {
    const events = recorderConnections.get(recorderId);
    if (!events || events.destroyed) return false;
    events.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  }

  function deliverToSession(sessionId, event) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    if (session.waiter) {
      const waiter = session.waiter;
      session.waiter = undefined;
      waiter(event);
    } else {
      session.queue.push(event);
    }
    return true;
  }

  function recorderIsAvailable() {
    const lease = currentRecorderLease();
    return Boolean(lease && recorderConnections.get(lease.recorderId));
  }

  async function toggle(sessionId, response) {
    pruneSessions();
    if (!sessions.has(sessionId)) {
      json(response, 404, { error: "Pi session is unavailable" });
      return;
    }
    if (!activeRecording) {
      if (!options.apiKey) {
        json(response, 503, { error: "Voice transcription unavailable: set OPENAI_API_KEY" });
        return;
      }
      const lease = currentRecorderLease();
      if (!lease || !recorderIsAvailable()) {
        json(response, 409, { error: "Open the voice page and enable the microphone" });
        return;
      }
      const session = sessions.get(sessionId);
      activeRecording = {
        config: { ...session.config },
        id: randomUUID(),
        ownerSessionId: sessionId,
        recorderId: lease.recorderId,
        state: "recording",
      };
      sendRecorderEvent(activeRecording.recorderId, "recording-start", {
        maxDurationSeconds: activeRecording.config.maxDurationSeconds,
        recordingId: activeRecording.id,
        sessionId: activeRecording.ownerSessionId,
      });
      json(response, 200, { state: "recording" });
      return;
    }
    if (activeRecording.ownerSessionId !== sessionId) {
      json(response, 409, { error: "Voice recording belongs to another Pi session" });
      return;
    }
    if (activeRecording.state !== "recording") {
      json(response, 409, { error: "Voice recording is already being transcribed" });
      return;
    }
    if (!recorderConnections.get(activeRecording.recorderId)) {
      json(response, 409, { error: "Recording browser is unavailable" });
      return;
    }
    activeRecording.state = "transcribing";
    sendRecorderEvent(activeRecording.recorderId, "recording-stop", {
      recordingId: activeRecording.id,
      sessionId: activeRecording.ownerSessionId,
    });
    json(response, 200, { state: "transcribing" });
  }

  return createServer(async (request, response) => {
    try {
      pruneSessions();
      currentRecorderLease();
      const url = new URL(request.url ?? "/", "http://voice-gateway");
      if (request.method === "GET" && url.pathname === "/") {
        await serveAsset(response, "index.html", "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        await serveAsset(response, "app.js", "text/javascript; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/recording-policy.js") {
        await serveAsset(
          response,
          "recording-policy.js",
          "text/javascript; charset=utf-8",
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        const transcriptionConfigured = Boolean(options.apiKey);
        json(response, 200, {
          status: transcriptionConfigured ? "ok" : "unconfigured",
          ...(transcriptionConfigured
            ? {}
            : { action: "Set OPENAI_API_KEY to enable transcription" }),
          transcriptionConfigured,
          browserArmed: recorderIsAvailable(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const input = await readJson(request);
        if (typeof input.id !== "string" || input.id.length === 0) {
          json(response, 400, { error: "Session id is required" });
          return;
        }
        const current = sessions.get(input.id);
        const inputConfig = input.config ?? defaultSessionConfig;
        let config;
        try {
          config = validateVoiceConfig(
            {
              language: inputConfig.language,
              maxDurationSeconds: Number(inputConfig.maxDurationSeconds),
              model: inputConfig.model,
            },
            options.maxDurationSeconds,
          );
        } catch (error) {
          json(response, 400, { error: error.message });
          return;
        }
        sessions.set(input.id, {
          config,
          expiresAt: options.now() + options.sessionTtlMs,
          label: typeof input.label === "string" ? input.label : input.id,
          queue: current?.queue ?? [],
          waiter: current?.waiter,
        });
        json(response, 201, { registered: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/browser/csrf") {
        json(response, 200, { token: issueCsrfToken() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/browser/events") {
        const recorderId = url.searchParams.get("id");
        if (!recorderId) {
          json(response, 400, { error: "Recorder id is required" });
          return;
        }
        response.writeHead(200, {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        });
        response.flushHeaders();
        const previous = recorderConnections.get(recorderId);
        recorderConnections.set(recorderId, response);
        if (previous && previous !== response) previous.end();
        request.on("close", () => {
          if (recorderConnections.get(recorderId) === response) {
            recorderConnections.delete(recorderId);
            if (activeRecording?.recorderId === recorderId) cancelRecording(activeRecording);
          }
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/browser/lease") {
        const input = await readJson(request);
        requireBrowserRequest(request);
        if (typeof input.id !== "string" || input.id.length === 0) {
          json(response, 400, { error: "Recorder id is required" });
          return;
        }
        if (!recorderConnections.get(input.id)) {
          json(response, 409, { error: "Browser event connection is unavailable" });
          return;
        }
        const lease = currentRecorderLease();
        if (lease && lease.recorderId !== input.id) {
          if (!input.takeover) {
            json(response, 409, { error: "Recorder lease is held by another browser" });
            return;
          }
          if (activeRecording) {
            json(response, 409, {
              error: "Recorder lease cannot be taken over during a recording",
            });
            return;
          }
        }
        recorderLease = {
          expiresAt: options.now() + options.recorderLeaseTtlMs,
          recorderId: input.id,
        };
        json(response, 200, { leased: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/browser/toggle") {
        requireBrowserRequest(request);
        const lease = currentRecorderLease();
        if (!lease || request.headers["x-recorder-id"] !== lease.recorderId) {
          json(response, 409, { error: "Browser does not hold the recorder lease" });
          return;
        }
        if (activeRecording) {
          await toggle(activeRecording.ownerSessionId, response);
          return;
        }
        if (sessions.size !== 1) {
          json(response, 409, { error: "Exactly one Pi session must be available" });
          return;
        }
        await toggle(sessions.keys().next().value, response);
        return;
      }
      const toggleMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/toggle$/);
      if (request.method === "POST" && toggleMatch) {
        await toggle(decodeURIComponent(toggleMatch[1]), response);
        return;
      }
      const nextMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/next$/);
      if (request.method === "GET" && nextMatch) {
        const session = sessions.get(decodeURIComponent(nextMatch[1]));
        if (!session) {
          json(response, 404, { error: "Pi session is unavailable" });
          return;
        }
        const item = session.queue.shift();
        if (item) {
          json(response, 200, item);
          return;
        }
        session.waiter?.();
        let settled = false;
        const finish = (event) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (session.waiter === finish) session.waiter = undefined;
          if (event) json(response, 200, event);
          else response.writeHead(204).end();
        };
        const timeout = setTimeout(() => finish(), options.pollTimeoutMs);
        session.waiter = finish;
        request.on("close", () => {
          if (!response.writableEnded) finish();
        });
        return;
      }
      const recordingMatch = url.pathname.match(/^\/api\/recordings\/([^/]+)$/);
      if (request.method === "DELETE" && recordingMatch) {
        requireBrowserRequest(request);
        const recording = activeRecording;
        if (
          !recording ||
          recording.id !== decodeURIComponent(recordingMatch[1]) ||
          recording.recorderId !== request.headers["x-recorder-id"]
        ) {
          json(response, 409, { error: "Recording is not active" });
          return;
        }
        cancelRecording(recording);
        json(response, 200, { cancelled: true });
        return;
      }
      if (request.method === "POST" && recordingMatch) {
        requireBrowserRequest(request);
        const recordingId = decodeURIComponent(recordingMatch[1]);
        const recording = activeRecording;
        if (
          !recording ||
          recording.id !== recordingId ||
          recording.recorderId !== request.headers["x-recorder-id"] ||
          !["recording", "transcribing"].includes(recording.state)
        ) {
          json(response, 409, { error: "Recording is not awaiting audio" });
          return;
        }
        if (!request.headers["content-type"]?.startsWith("audio/")) {
          throw new RequestError(415, "Expected an audio upload");
        }
        recording.state = "processing";
        try {
          const maxUploadBytes =
            recording.config.maxDurationSeconds * options.uploadBytesPerSecond;
          const audio = await readBody(
            request,
            maxUploadBytes,
            `Recording exceeds the ${recording.config.maxDurationSeconds} second upload limit`,
          );
          const contentType = request.headers["content-type"] ?? "audio/webm";
          const text = await transcribe(audio, contentType, {
            ...options,
            ...recording.config,
          });
          pruneSessions();
          const delivered = deliverToSession(recording.ownerSessionId, { type: "transcript", text });
          if (activeRecording === recording) activeRecording = undefined;
          if (delivered) {
            sendRecorderEvent(recording.recorderId, "recording-complete", {
              recordingId: recording.id,
              sessionId: recording.ownerSessionId,
            });
          } else {
            sendRecorderEvent(recording.recorderId, "recording-recovery", { text });
          }
          json(response, 200, { transcribed: true });
        } catch (error) {
          if (activeRecording === recording) activeRecording = undefined;
          const message = error.status
            ? error.message
            : "Voice transcription failed; check OpenAI access and try again";
          deliverToSession(recording.ownerSessionId, { type: "error", message });
          sendRecorderEvent(recording.recorderId, "recording-error", { message });
          json(response, error.status ?? 500, { error: error.message });
        }
        return;
      }
      json(response, 404, { error: "Not found" });
    } catch (error) {
      json(response, error.status ?? 500, { error: error.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.VOICE_GATEWAY_PORT ?? 4317);
  createVoiceGateway().listen(port, "0.0.0.0", () => {
    console.log(`voice gateway listening on ${port}`);
  });
}
