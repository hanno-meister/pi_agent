import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";

import { createVoiceGateway } from "../gateway.js";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections?.();
  await closed;
}

async function requestStatus(gatewayUrl, path, options = {}) {
  const target = new URL(gatewayUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        method: options.method ?? "GET",
        path,
        port: target.port,
        headers: options.headers,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function register(gatewayUrl, id, config) {
  return fetch(`${gatewayUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, label: `/workspace/${id}`, config }),
  });
}

const recorderCredentials = new Map();

async function connectRecorder(gatewayUrl, recorderId) {
  const events = await fetch(
    `${gatewayUrl}/api/browser/events?id=${encodeURIComponent(recorderId)}`,
  );
  assert.equal(events.status, 200);
  const csrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
  recorderCredentials.set(recorderId, {
    origin: gatewayUrl,
    token: (await csrf.json()).token,
  });
  return events;
}

async function acquireLease(gatewayUrl, recorderId, takeover = false) {
  return fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: recorderHeaders(recorderId, { "content-type": "application/json" }),
    body: JSON.stringify({ id: recorderId, takeover }),
  });
}

async function acknowledgeCaptureStart(gatewayUrl, recorderId, recordingId) {
  return fetch(`${gatewayUrl}/api/recordings/${encodeURIComponent(recordingId)}/capture-start`, {
    method: "POST",
    headers: recorderHeaders(recorderId),
  });
}

async function readSseEvent(response, expectedEvent) {
  const reader = response.body.getReader();
  return readSseEventFromReader(reader, expectedEvent);
}

async function readSseEventFromReader(reader, expectedEvent) {
  const decoder = new TextDecoder();
  let body = "";
  while (!body.includes("\n\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  assert.equal(body.match(/^event: (.+)$/m)?.[1], expectedEvent);
  return JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? "null");
}

function recorderHeaders(recorderId, extra = {}) {
  const credentials = recorderCredentials.get(recorderId);
  return {
    "x-csrf-token": credentials?.token,
    "x-recorder-id": recorderId,
    origin: credentials?.origin,
    ...extra,
  };
}

test("concurrent sessions cannot stop, duplicate, or receive another session's recording", async (t) => {
  let releaseTranscription;
  let upstreamBody;
  let upstreamRequests = 0;
  const upstream = createServer(async (request, response) => {
    upstreamRequests += 1;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    upstreamBody = Buffer.concat(chunks).toString("utf8");
    await new Promise((resolve) => {
      releaseTranscription = resolve;
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ text: "dictated prompt" }));
  });
  const upstreamUrl = await listen(upstream);
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    pollTimeoutMs: 200,
    transcriptionUrl: `${upstreamUrl}/v1/audio/transcriptions`,
  });
  const gatewayUrl = await listen(gateway);
  t.after(async () => {
    await close(gateway);
    await close(upstream);
  });

  assert.equal(
    (
      await register(gatewayUrl, "session-a", {
        language: "de",
        maxDurationSeconds: 45,
        model: "gpt-4o-transcribe",
      })
    ).status,
    201,
  );
  assert.equal((await register(gatewayUrl, "session-b")).status, 201);
  const startEvents = await connectRecorder(gatewayUrl, "recorder-a");
  assert.equal((await acquireLease(gatewayUrl, "recorder-a")).status, 200);

  const started = await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await started.json(), { state: "recording" });
  const recording = await readSseEvent(startEvents, "recording-start");
  assert.equal(recording.sessionId, "session-a");
  assert.equal(recording.maxDurationSeconds, 45);
  assert.equal(typeof recording.recordingId, "string");

  const competingStop = await fetch(`${gatewayUrl}/api/sessions/session-b/toggle`, {
    method: "POST",
  });
  assert.equal(competingStop.status, 409);
  assert.deepEqual(await competingStop.json(), {
    error: "Voice recording belongs to another Pi session",
  });

  const stopEvents = await connectRecorder(gatewayUrl, "recorder-a");
  const stopped = await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await stopped.json(), { state: "transcribing" });
  assert.equal(
    (await readSseEvent(stopEvents, "recording-stop")).recordingId,
    recording.recordingId,
  );

  const deliveryA = fetch(`${gatewayUrl}/api/sessions/session-a/next`);
  const upload = fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("recorder-a", {
      "content-type": "audio/webm;codecs=opus",
    }),
    body: Buffer.from("fake-webm-audio"),
  });
  while (!releaseTranscription) await new Promise((resolve) => setTimeout(resolve, 1));

  const duplicate = await fetch(
    `${gatewayUrl}/api/recordings/${recording.recordingId}`,
    {
      method: "POST",
      headers: recorderHeaders("recorder-a", { "content-type": "audio/webm" }),
      body: Buffer.from("duplicate-audio"),
    },
  );
  assert.equal(duplicate.status, 409);
  releaseTranscription();
  assert.equal((await upload).status, 200);
  assert.deepEqual(await (await deliveryA).json(), {
    type: "transcript",
    text: "dictated prompt",
  });

  const deliveryB = await fetch(`${gatewayUrl}/api/sessions/session-b/next`);
  assert.equal(deliveryB.status, 204);
  const replay = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("recorder-a"),
    body: Buffer.from("replay"),
  });
  assert.equal(replay.status, 409);
  assert.equal(
    (await fetch(`${gatewayUrl}/api/sessions/session-a/next`)).status,
    204,
  );
  assert.equal(upstreamRequests, 1);
  assert.match(upstreamBody, /gpt-4o-transcribe/);
  assert.match(upstreamBody, /name="language"\r\n\r\nde/);
  assert.match(upstreamBody, /fake-webm-audio/);
});

test("transcription timeout releases a recording for a subsequent attempt", async (t) => {
  let transcriptionSignal;
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    transcriptionTimeoutMs: 20,
    fetchImpl: async (_url, options) => {
      transcriptionSignal = options.signal;
      return new Promise(() => {});
    },
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "timeout-session");
  const events = await connectRecorder(gatewayUrl, "timeout-recorder");
  await acquireLease(gatewayUrl, "timeout-recorder");
  await fetch(`${gatewayUrl}/api/sessions/timeout-session/toggle`, { method: "POST" });
  const recording = await readSseEvent(events, "recording-start");

  const stopEvents = await connectRecorder(gatewayUrl, "timeout-recorder");
  await fetch(`${gatewayUrl}/api/sessions/timeout-session/toggle`, { method: "POST" });
  await readSseEvent(stopEvents, "recording-stop");

  const upload = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("timeout-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  assert.equal(upload.status, 500);
  assert.deepEqual(await upload.json(), {
    error: "Voice transcription failed; check OpenAI access and try again",
  });
  assert.equal(transcriptionSignal.aborted, true);

  const nextEvents = await connectRecorder(gatewayUrl, "timeout-recorder");
  await acquireLease(gatewayUrl, "timeout-recorder");
  const nextStart = await fetch(`${gatewayUrl}/api/sessions/timeout-session/toggle`, {
    method: "POST",
  });
  assert.equal(nextStart.status, 200);
  await readSseEvent(nextEvents, "recording-start");
});

test("cancelling processing aborts upstream work and suppresses late results", async (t) => {
  let resolveTranscription;
  let transcriptionSignal;
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    pollTimeoutMs: 200,
    fetchImpl: async (_url, options) => {
      transcriptionSignal = options.signal;
      return new Promise((resolve) => {
        resolveTranscription = resolve;
      });
    },
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "cancel-session");
  const startEvents = await connectRecorder(gatewayUrl, "cancel-recorder");
  await acquireLease(gatewayUrl, "cancel-recorder");
  await fetch(`${gatewayUrl}/api/sessions/cancel-session/toggle`, { method: "POST" });
  const recording = await readSseEvent(startEvents, "recording-start");

  const events = await connectRecorder(gatewayUrl, "cancel-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/cancel-session/toggle`, { method: "POST" });
  await readSseEventFromReader(eventReader, "recording-stop");

  const delivery = fetch(`${gatewayUrl}/api/sessions/cancel-session/next`);
  const upload = fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("cancel-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  while (!resolveTranscription) await new Promise((resolve) => setTimeout(resolve, 1));

  const cancelled = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "DELETE",
    headers: recorderHeaders("cancel-recorder"),
  });
  assert.equal(cancelled.status, 200);
  assert.equal(transcriptionSignal.aborted, true);
  await readSseEventFromReader(eventReader, "recording-cancelled");

  resolveTranscription(new Response(JSON.stringify({ text: "late transcript" }), {
    headers: { "content-type": "application/json" },
  }));
  const uploadResult = await upload;
  assert.equal(uploadResult.status, 409);
  assert.deepEqual(await uploadResult.json(), { error: "Recording was cancelled" });
  assert.equal((await delivery).status, 204);

  const lateEvent = await Promise.race([
    eventReader.read().then(() => "event"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 30)),
  ]);
  assert.equal(lateEvent, "timeout");
  await eventReader.cancel();

  const nextEvents = await connectRecorder(gatewayUrl, "cancel-recorder");
  await acquireLease(gatewayUrl, "cancel-recorder");
  const nextStart = await fetch(`${gatewayUrl}/api/sessions/cancel-session/toggle`, {
    method: "POST",
  });
  assert.equal(nextStart.status, 200);
  await readSseEvent(nextEvents, "recording-start");
});

test("aborted processing uploads cancel upstream work without late delivery", async (t) => {
  let resolveTranscription;
  let upstreamAbort;
  const upstreamAborted = new Promise((resolve) => {
    upstreamAbort = resolve;
  });
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    pollTimeoutMs: 200,
    fetchImpl: async (_url, options) => {
      options.signal.addEventListener("abort", upstreamAbort, { once: true });
      return new Promise((resolve) => {
        resolveTranscription = resolve;
      });
    },
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "aborted-session");
  const startEvents = await connectRecorder(gatewayUrl, "aborted-recorder");
  await acquireLease(gatewayUrl, "aborted-recorder");
  await fetch(`${gatewayUrl}/api/sessions/aborted-session/toggle`, { method: "POST" });
  const recording = await readSseEvent(startEvents, "recording-start");

  const events = await connectRecorder(gatewayUrl, "aborted-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/aborted-session/toggle`, { method: "POST" });
  await readSseEventFromReader(eventReader, "recording-stop");

  const delivery = fetch(`${gatewayUrl}/api/sessions/aborted-session/next`);
  const abortController = new AbortController();
  const upload = fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("aborted-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
    signal: abortController.signal,
  });
  while (!resolveTranscription) await new Promise((resolve) => setTimeout(resolve, 1));

  abortController.abort();
  await assert.rejects(upload);
  await upstreamAborted;
  await readSseEventFromReader(eventReader, "recording-cancelled");
  resolveTranscription(new Response(JSON.stringify({ text: "late transcript" }), {
    headers: { "content-type": "application/json" },
  }));
  assert.equal((await delivery).status, 204);

  const lateEvent = await Promise.race([
    eventReader.read().then(() => "event"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 30)),
  ]);
  assert.equal(lateEvent, "timeout");
  await eventReader.cancel();

  const nextEvents = await connectRecorder(gatewayUrl, "aborted-recorder");
  await acquireLease(gatewayUrl, "aborted-recorder");
  const nextStart = await fetch(`${gatewayUrl}/api/sessions/aborted-session/toggle`, {
    method: "POST",
  });
  assert.equal(nextStart.status, 200);
  await readSseEvent(nextEvents, "recording-start");
});

test("invalid session configuration and oversized audio fail before transcription", async (t) => {
  let upstreamRequests = 0;
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    fetchImpl: async () => {
      upstreamRequests += 1;
      return new Response(JSON.stringify({ text: "within boundary" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    maxDurationSeconds: 2,
    uploadBytesPerSecond: 4,
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  const invalidModel = await register(gatewayUrl, "invalid-model", {
    language: "en",
    maxDurationSeconds: 1,
    model: "not-a-model",
  });
  assert.equal(invalidModel.status, 400);
  assert.match((await invalidModel.json()).error, /Unsupported voice transcription model/);

  const invalidDuration = await register(gatewayUrl, "invalid-duration", {
    language: "en",
    maxDurationSeconds: 3,
    model: "whisper-1",
  });
  assert.equal(invalidDuration.status, 400);
  assert.match(
    (await invalidDuration.json()).error,
    /VOICE_MAX_DURATION_SECONDS must be an integer from 1 to 2/,
  );

  assert.equal(
    (
      await register(gatewayUrl, "bounded-session", {
        language: "en",
        maxDurationSeconds: 1,
        model: "whisper-1",
      })
    ).status,
    201,
  );
  const events = await connectRecorder(gatewayUrl, "bounded-recorder");
  await acquireLease(gatewayUrl, "bounded-recorder");
  await fetch(`${gatewayUrl}/api/sessions/bounded-session/toggle`, { method: "POST" });
  const recording = await readSseEvent(events, "recording-start");

  // The browser's duration timer stops locally and uploads directly; the upload
  // must atomically advance a still-recording gateway state.
  const boundaryUpload = await fetch(
    `${gatewayUrl}/api/recordings/${recording.recordingId}`,
    {
      method: "POST",
      headers: recorderHeaders("bounded-recorder", { "content-type": "audio/webm" }),
      body: Buffer.from("1234"),
    },
  );
  assert.equal(boundaryUpload.status, 200);
  assert.equal(upstreamRequests, 1);

  const nextStartEvents = await connectRecorder(gatewayUrl, "bounded-recorder");
  await fetch(`${gatewayUrl}/api/sessions/bounded-session/toggle`, { method: "POST" });
  const nextRecording = await readSseEvent(nextStartEvents, "recording-start");
  const nextStopEvents = await connectRecorder(gatewayUrl, "bounded-recorder");
  await fetch(`${gatewayUrl}/api/sessions/bounded-session/toggle`, { method: "POST" });
  await readSseEvent(nextStopEvents, "recording-stop");
  const oversizedUpload = await fetch(
    `${gatewayUrl}/api/recordings/${nextRecording.recordingId}`,
    {
      method: "POST",
      headers: recorderHeaders("bounded-recorder", { "content-type": "audio/webm" }),
      body: Buffer.from("12345"),
    },
  );
  assert.equal(oversizedUpload.status, 413);
  assert.deepEqual(await oversizedUpload.json(), {
    error: "Recording exceeds the 1 second upload limit",
  });
  assert.equal(upstreamRequests, 1);

  assert.throws(
    () => createVoiceGateway({ maxDurationSeconds: 0 }),
    /VOICE_MAX_DURATION_SECONDS must be an integer from 1 to 3600/,
  );
});

test("one recorder lease requires explicit idle takeover and cannot be stolen while recording", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key" });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "session-a");
  await connectRecorder(gatewayUrl, "recorder-a");
  await connectRecorder(gatewayUrl, "recorder-b");
  assert.equal((await acquireLease(gatewayUrl, "recorder-a")).status, 200);
  assert.equal((await acquireLease(gatewayUrl, "recorder-a")).status, 200);
  assert.equal((await acquireLease(gatewayUrl, "recorder-b")).status, 409);
  assert.equal((await acquireLease(gatewayUrl, "recorder-b", true)).status, 200);

  const events = await connectRecorder(gatewayUrl, "recorder-b");
  assert.equal(
    (await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, { method: "POST" }))
      .status,
    200,
  );
  const recording = await readSseEvent(events, "recording-start");
  const takeover = await acquireLease(gatewayUrl, "recorder-a", true);
  assert.equal(takeover.status, 409);
  assert.deepEqual(await takeover.json(), {
    error: "Recorder lease cannot be taken over during a recording",
  });

  const staleRecorderUpload = await fetch(
    `${gatewayUrl}/api/recordings/${recording.recordingId}`,
    {
      method: "POST",
      headers: recorderHeaders("recorder-a"),
      body: Buffer.from("audio"),
    },
  );
  assert.equal(staleRecorderUpload.status, 409);
});

test("recorder disconnect cancels an active recording", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key" });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "session-a");
  const events = await connectRecorder(gatewayUrl, "disconnecting-recorder");
  await acquireLease(gatewayUrl, "disconnecting-recorder");
  assert.deepEqual(await (await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  })).json(), { state: "recording" });
  await events.body.cancel();
  await new Promise((resolve) => setTimeout(resolve, 5));

  await connectRecorder(gatewayUrl, "disconnecting-recorder");
  await acquireLease(gatewayUrl, "disconnecting-recorder");
  assert.deepEqual(await (await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  })).json(), { state: "recording" });
});

test("a stale target discards its transcript without recorder recovery", async (t) => {
  let now = 0;
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    now: () => now,
    sessionTtlMs: 10,
    fetchImpl: async () => new Response(JSON.stringify({ text: "copy this" }), {
      headers: { "content-type": "application/json" },
    }),
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "vanishing-session");
  const events = await connectRecorder(gatewayUrl, "stale-recorder");
  await acquireLease(gatewayUrl, "stale-recorder");
  await fetch(`${gatewayUrl}/api/sessions/vanishing-session/toggle`, { method: "POST" });
  now = 11;

  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  while ((body.match(/^event:/gm) ?? []).length < 1) {
    const { value } = await reader.read();
    body += decoder.decode(value, { stream: true });
  }
  const recordingId = JSON.parse(body.match(/event: recording-start\ndata: (.+)/)?.[1] ?? "null").recordingId;
  const staleUpload = await fetch(`${gatewayUrl}/api/recordings/${recordingId}`, {
    method: "POST",
    headers: recorderHeaders("stale-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  assert.equal(staleUpload.status, 200);
  assert.deepEqual(await staleUpload.json(), { transcribed: true, discarded: true });
  const lateEvent = await Promise.race([
    reader.read().then(() => "event"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 30)),
  ]);
  assert.equal(lateEvent, "timeout");
  await reader.cancel();
  assert.equal((await fetch(`${gatewayUrl}/api/sessions/vanishing-session/next`)).status, 404);
});

test("browser mutations require same-origin CSRF credentials", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key" });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  const port = new URL(gatewayUrl).port;
  for (const hostname of ["localhost", "127.0.0.1"]) {
    const csrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
    const accepted = await fetch(`http://${hostname}:${port}/api/browser/lease`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: `http://${hostname}:${port}`,
        "x-csrf-token": (await csrf.json()).token,
      },
      body: JSON.stringify({ id: "attacker" }),
    });
    assert.equal(accepted.status, 409);
  }

  const attackerCsrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const attackerHost = await requestStatus(gatewayUrl, "/api/browser/lease", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: `attacker.test:${port}`,
      origin: `http://attacker.test:${port}`,
      "x-csrf-token": (await attackerCsrf.json()).token,
    },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(attackerHost, 403);

  const hostile = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.test" },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(hostile.status, 403);

  const malformedOriginCsrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const malformedOrigin = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "not-an-origin",
      "x-csrf-token": (await malformedOriginCsrf.json()).token,
    },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(malformedOrigin.status, 403);

  const mismatchCsrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const mismatch = await requestStatus(gatewayUrl, "/api/browser/lease", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: `localhost:${port}`,
      origin: gatewayUrl,
      "x-csrf-token": (await mismatchCsrf.json()).token,
    },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(mismatch, 403);

  const missingToken = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: gatewayUrl },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(missingToken.status, 403);

  const unsupportedContent = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: { "content-type": "text/plain", origin: gatewayUrl },
    body: "not json",
  });
  assert.equal(unsupportedContent.status, 415);
});

test("deleting an agent session wakes polling and cancels its recording", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key", pollTimeoutMs: 1000 });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "deleted-session");
  const events = await connectRecorder(gatewayUrl, "deleted-recorder");
  await acquireLease(gatewayUrl, "deleted-recorder");
  const eventReader = events.body.getReader();
  const started = await fetch(`${gatewayUrl}/api/sessions/deleted-session/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await started.json(), { state: "recording" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");

  const delivery = fetch(`${gatewayUrl}/api/sessions/deleted-session/next`);
  await new Promise((resolve) => setImmediate(resolve));
  const deleted = await fetch(`${gatewayUrl}/api/sessions/deleted-session`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal((await delivery).status, 204);
  assert.deepEqual(
    await readSseEventFromReader(eventReader, "recording-cancelled"),
    { recordingId: recording.recordingId },
  );
  assert.equal(
    (await fetch(`${gatewayUrl}/api/sessions/deleted-session/toggle`, { method: "POST" })).status,
    404,
  );
  await eventReader.cancel();
});

test("recording deadlines cancel unanswered recordings and are cleaned up", async (t) => {
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    captureStartTimeoutMs: 20,
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "deadline-session", {
    language: "en",
    maxDurationSeconds: 1,
    model: "whisper-1",
  });
  const events = await connectRecorder(gatewayUrl, "deadline-recorder");
  await acquireLease(gatewayUrl, "deadline-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/deadline-session/toggle`, { method: "POST" });
  await readSseEventFromReader(eventReader, "recording-start");
  await readSseEventFromReader(eventReader, "recording-cancelled");

  const nextStart = await fetch(`${gatewayUrl}/api/sessions/deadline-session/toggle`, {
    method: "POST",
  });
  assert.equal(nextStart.status, 200);
  await readSseEventFromReader(eventReader, "recording-start");
  await eventReader.cancel();
});

test("a delayed capture acknowledgement starts the capture deadline", async (t) => {
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    captureStartTimeoutMs: 700,
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "delayed-start-session", {
    language: "en",
    maxDurationSeconds: 1,
    model: "whisper-1",
  });
  const events = await connectRecorder(gatewayUrl, "delayed-start-recorder");
  await acquireLease(gatewayUrl, "delayed-start-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/delayed-start-session/toggle`, { method: "POST" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(
    (await acknowledgeCaptureStart(
      gatewayUrl,
      "delayed-start-recorder",
      recording.recordingId,
    )).status,
    200,
  );
  await new Promise((resolve) => setTimeout(resolve, 900));

  const stopped = await fetch(
    `${gatewayUrl}/api/sessions/delayed-start-session/toggle`,
    { method: "POST" },
  );
  assert.deepEqual(await stopped.json(), { state: "transcribing" });
  await readSseEventFromReader(eventReader, "recording-stop");
  const cancelled = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "DELETE",
    headers: recorderHeaders("delayed-start-recorder"),
  });
  assert.equal(cancelled.status, 200);
  await readSseEventFromReader(eventReader, "recording-cancelled");
  await eventReader.cancel();
});

test("capture deadline allows upload arrival grace after configured duration", async (t) => {
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ text: "grace transcript" }), {
      headers: { "content-type": "application/json" },
    }),
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "grace-session", {
    language: "en",
    maxDurationSeconds: 1,
    model: "whisper-1",
  });
  const events = await connectRecorder(gatewayUrl, "grace-recorder");
  await acquireLease(gatewayUrl, "grace-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/grace-session/toggle`, { method: "POST" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");
  assert.equal(
    (await acknowledgeCaptureStart(
      gatewayUrl,
      "grace-recorder",
      recording.recordingId,
    )).status,
    200,
  );
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const stopped = await fetch(`${gatewayUrl}/api/sessions/grace-session/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await stopped.json(), { state: "transcribing" });
  await readSseEventFromReader(eventReader, "recording-stop");
  const delivery = fetch(`${gatewayUrl}/api/sessions/grace-session/next`);
  const upload = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("grace-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  assert.equal(upload.status, 200);
  assert.deepEqual(await delivery.then((response) => response.json()), {
    type: "transcript",
    text: "grace transcript",
  });
  await eventReader.cancel();
});

test("slow transcription may finish after the capture deadline", async (t) => {
  let releaseTranscription;
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    fetchImpl: async () => new Promise((resolve) => {
      releaseTranscription = resolve;
    }),
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "slow-session", {
    language: "en",
    maxDurationSeconds: 1,
    model: "whisper-1",
  });
  const events = await connectRecorder(gatewayUrl, "slow-recorder");
  await acquireLease(gatewayUrl, "slow-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/slow-session/toggle`, { method: "POST" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");
  assert.deepEqual(
    await (await acknowledgeCaptureStart(gatewayUrl, "slow-recorder", recording.recordingId)).json(),
    { acknowledged: true },
  );
  await fetch(`${gatewayUrl}/api/sessions/slow-session/toggle`, { method: "POST" });
  await readSseEventFromReader(eventReader, "recording-stop");
  const delivery = fetch(`${gatewayUrl}/api/sessions/slow-session/next`);
  const upload = fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("slow-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  while (!releaseTranscription) await new Promise((resolve) => setTimeout(resolve, 1));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  releaseTranscription(new Response(JSON.stringify({ text: "slow transcript" }), {
    headers: { "content-type": "application/json" },
  }));
  assert.equal((await upload).status, 200);
  assert.deepEqual(await (await delivery).json(), {
    type: "transcript",
    text: "slow transcript",
  });
  await eventReader.cancel();
});

test("capture-start acknowledgements require the active recording's recorder", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key" });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "ack-session");
  const events = await connectRecorder(gatewayUrl, "ack-recorder");
  await acquireLease(gatewayUrl, "ack-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/ack-session/toggle`, { method: "POST" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");

  const unauthorized = await fetch(
    `${gatewayUrl}/api/recordings/${recording.recordingId}/capture-start`,
    { method: "POST" },
  );
  assert.equal(unauthorized.status, 403);
  const wrongRecording = await acknowledgeCaptureStart(
    gatewayUrl,
    "ack-recorder",
    "not-the-active-recording",
  );
  assert.equal(wrongRecording.status, 409);
  const wrongRecorder = await fetch(
    `${gatewayUrl}/api/recordings/${recording.recordingId}/capture-start`,
    {
      method: "POST",
      headers: recorderHeaders("ack-recorder", { "x-recorder-id": "other-recorder" }),
    },
  );
  assert.equal(wrongRecorder.status, 409);
  assert.deepEqual(
    await (await acknowledgeCaptureStart(
      gatewayUrl,
      "ack-recorder",
      recording.recordingId,
    )).json(),
    { acknowledged: true },
  );
  const cancelled = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "DELETE",
    headers: recorderHeaders("ack-recorder"),
  });
  assert.equal(cancelled.status, 200);
  await readSseEventFromReader(eventReader, "recording-cancelled");
  await eventReader.cancel();
});

test("quick-stop acknowledgement and upload remain accepted", async (t) => {
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ text: "quick transcript" }), {
      headers: { "content-type": "application/json" },
    }),
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "quick-stop-session");
  const events = await connectRecorder(gatewayUrl, "quick-stop-recorder");
  await acquireLease(gatewayUrl, "quick-stop-recorder");
  const eventReader = events.body.getReader();
  await fetch(`${gatewayUrl}/api/sessions/quick-stop-session/toggle`, { method: "POST" });
  const recording = await readSseEventFromReader(eventReader, "recording-start");
  const stopped = await fetch(`${gatewayUrl}/api/sessions/quick-stop-session/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await stopped.json(), { state: "transcribing" });
  await readSseEventFromReader(eventReader, "recording-stop");

  assert.deepEqual(
    await (await acknowledgeCaptureStart(
      gatewayUrl,
      "quick-stop-recorder",
      recording.recordingId,
    )).json(),
    { acknowledged: true },
  );
  const delivery = fetch(`${gatewayUrl}/api/sessions/quick-stop-session/next`);
  const upload = await fetch(`${gatewayUrl}/api/recordings/${recording.recordingId}`, {
    method: "POST",
    headers: recorderHeaders("quick-stop-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  assert.equal(upload.status, 200);
  assert.deepEqual(await delivery.then((response) => response.json()), {
    type: "transcript",
    text: "quick transcript",
  });
  await eventReader.cancel();
});

test("CSRF issuance and validation prune expired tokens", async (t) => {
  let now = 0;
  const gateway = createVoiceGateway({ now: () => now, csrfTtlMs: 10 });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  const first = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const firstToken = (await first.json()).token;
  now = 11;
  const second = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const secondToken = (await second.json()).token;
  const stale = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: gatewayUrl,
      "x-csrf-token": firstToken,
    },
    body: JSON.stringify({ id: "stale-recorder" }),
  });
  assert.equal(stale.status, 403);
  const current = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: gatewayUrl,
      "x-csrf-token": secondToken,
    },
    body: JSON.stringify({ id: "stale-recorder" }),
  });
  assert.equal(current.status, 409);
});

test("agent-session and browser-lease JSON bodies must be objects", async (t) => {
  const gateway = createVoiceGateway();
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  for (const body of ["null", "[]", "1", JSON.stringify("session")]) {
    const result = await fetch(`${gatewayUrl}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(result.status, 400);
  }

  const csrf = await fetch(`${gatewayUrl}/api/browser/csrf`);
  const token = (await csrf.json()).token;
  for (const body of ["null", "[]"]) {
    const result = await fetch(`${gatewayUrl}/api/browser/lease`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: gatewayUrl,
        "x-csrf-token": token,
      },
      body,
    });
    assert.equal(result.status, 400);
  }
});
