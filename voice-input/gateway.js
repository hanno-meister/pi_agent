import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const defaultTranscriptionUrl = "https://api.openai.com/v1/audio/transcriptions";

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  return JSON.parse(body.toString("utf8"));
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
  if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
  const result = await response.json();
  if (typeof result.text !== "string") throw new Error("Transcription response had no text");
  return result.text;
}

export function createVoiceGateway(overrides = {}) {
  const options = {
    apiKey: overrides.apiKey ?? process.env.OPENAI_API_KEY ?? "",
    fetchImpl: overrides.fetchImpl ?? fetch,
    language: overrides.language ?? process.env.VOICE_LANGUAGE ?? "en",
    model:
      overrides.model ??
      process.env.VOICE_TRANSCRIPTION_MODEL ??
      "gpt-4o-mini-transcribe",
    transcriptionUrl: overrides.transcriptionUrl ?? defaultTranscriptionUrl,
  };
  const sessions = new Map();
  let browserEvents;
  let browserArmed = false;
  let activeRecording;

  function sendBrowserEvent(event, data) {
    if (!browserEvents || browserEvents.destroyed) return false;
    browserEvents.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  }

  function deliverToSession(sessionId, event) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.waiter) {
      const waiter = session.waiter;
      session.waiter = undefined;
      waiter(event);
      return;
    }
    session.queue.push(event);
  }

  async function toggle(sessionId, response) {
    if (!sessions.has(sessionId)) {
      json(response, 404, { error: "Pi session is unavailable" });
      return;
    }
    if (!activeRecording) {
      if (!browserArmed || !browserEvents) {
        json(response, 409, { error: "Open the voice page and enable the microphone" });
        return;
      }
      activeRecording = { sessionId, state: "recording" };
      sendBrowserEvent("recording-start", { sessionId });
      json(response, 200, { state: "recording" });
      return;
    }
    if (activeRecording.sessionId !== sessionId) {
      json(response, 409, { error: "Voice recording belongs to another Pi session" });
      return;
    }
    if (activeRecording.state !== "recording") {
      json(response, 409, { error: "Voice recording is already being transcribed" });
      return;
    }
    activeRecording.state = "transcribing";
    sendBrowserEvent("recording-stop", { sessionId });
    json(response, 200, { state: "transcribing" });
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://voice-gateway");
      if (request.method === "GET" && url.pathname === "/") {
        await serveAsset(response, "index.html", "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        await serveAsset(response, "app.js", "text/javascript; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, {
          status: "ok",
          transcriptionConfigured: Boolean(options.apiKey),
          browserArmed,
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
        sessions.set(input.id, {
          label: typeof input.label === "string" ? input.label : input.id,
          queue: current?.queue ?? [],
          waiter: current?.waiter,
        });
        json(response, 201, { registered: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/browser/events") {
        response.writeHead(200, {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        });
        response.flushHeaders();
        browserEvents = response;
        request.on("close", () => {
          if (browserEvents === response) {
            browserEvents = undefined;
            browserArmed = false;
          }
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/browser/armed") {
        if (!browserEvents) {
          json(response, 409, { error: "Browser event connection is unavailable" });
          return;
        }
        browserArmed = true;
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/browser/toggle") {
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
        if (session.waiter) session.waiter(undefined);
        let settled = false;
        const finish = (event) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (session.waiter === finish) session.waiter = undefined;
          if (event) json(response, 200, event);
          else response.writeHead(204).end();
        };
        const timeout = setTimeout(() => finish(undefined), 25_000);
        session.waiter = finish;
        request.on("close", () => {
          if (!response.writableEnded) finish(undefined);
        });
        return;
      }
      const recordingMatch = url.pathname.match(/^\/api\/recordings\/([^/]+)$/);
      if (request.method === "POST" && recordingMatch) {
        const sessionId = decodeURIComponent(recordingMatch[1]);
        if (
          !activeRecording ||
          activeRecording.sessionId !== sessionId ||
          activeRecording.state !== "transcribing"
        ) {
          json(response, 409, { error: "Recording is not awaiting audio" });
          return;
        }
        const audio = await readBody(request);
        const contentType = request.headers["content-type"] ?? "audio/webm";
        const text = await transcribe(audio, contentType, options);
        deliverToSession(sessionId, { type: "transcript", text });
        activeRecording = undefined;
        sendBrowserEvent("recording-complete", { sessionId });
        json(response, 200, { transcribed: true });
        return;
      }
      json(response, 404, { error: "Not found" });
    } catch (error) {
      activeRecording = undefined;
      sendBrowserEvent("recording-error", { message: error.message });
      json(response, 500, { error: error.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.VOICE_GATEWAY_PORT ?? 4317);
  createVoiceGateway().listen(port, "0.0.0.0", () => {
    console.log(`voice gateway listening on ${port}`);
  });
}
