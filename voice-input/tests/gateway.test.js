import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
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

async function readSseEvent(response, expectedEvent) {
  const reader = response.body.getReader();
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

test("stale session registrations expire while renewed sessions remain live", async (t) => {
  const gateway = createVoiceGateway({
    apiKey: "test-key",
    sessionTtlMs: 30,
  });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  await register(gatewayUrl, "stale-session");
  await register(gatewayUrl, "live-session");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await register(gatewayUrl, "live-session");
  await new Promise((resolve) => setTimeout(resolve, 20));

  const events = await connectRecorder(gatewayUrl, "recorder-a");
  await acquireLease(gatewayUrl, "recorder-a");
  const fallback = await fetch(`${gatewayUrl}/api/browser/toggle`, {
    method: "POST",
    headers: recorderHeaders("recorder-a"),
  });
  assert.deepEqual(await fallback.json(), { state: "recording" });
  assert.equal((await readSseEvent(events, "recording-start")).sessionId, "live-session");
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

test("a stale target is never rerouted and recovers only in the recorder", async (t) => {
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
  const events = await connectRecorder(gatewayUrl, "recovery-recorder");
  await acquireLease(gatewayUrl, "recovery-recorder");
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
  const recoveryUpload = await fetch(`${gatewayUrl}/api/recordings/${recordingId}`, {
    method: "POST",
    headers: recorderHeaders("recovery-recorder", { "content-type": "audio/webm" }),
    body: Buffer.from("audio"),
  });
  assert.equal(recoveryUpload.status, 200);
  while (!body.includes("event: recording-recovery")) {
    const { value } = await reader.read();
    body += decoder.decode(value, { stream: true });
  }
  assert.match(body, /event: recording-recovery\ndata: {"text":"copy this"}/);
  assert.equal((await fetch(`${gatewayUrl}/api/sessions/vanishing-session/next`)).status, 404);
});

test("browser mutations require same-origin CSRF credentials", async (t) => {
  const gateway = createVoiceGateway({ apiKey: "test-key" });
  const gatewayUrl = await listen(gateway);
  t.after(() => close(gateway));

  const hostile = await fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.test" },
    body: JSON.stringify({ id: "attacker" }),
  });
  assert.equal(hostile.status, 403);

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
