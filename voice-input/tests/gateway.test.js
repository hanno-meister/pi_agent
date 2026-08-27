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

async function register(gatewayUrl, id) {
  return fetch(`${gatewayUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, label: `/workspace/${id}` }),
  });
}

async function connectRecorder(gatewayUrl, recorderId) {
  const events = await fetch(
    `${gatewayUrl}/api/browser/events?id=${encodeURIComponent(recorderId)}`,
  );
  assert.equal(events.status, 200);
  return events;
}

async function acquireLease(gatewayUrl, recorderId, takeover = false) {
  return fetch(`${gatewayUrl}/api/browser/lease`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  await reader.cancel();
  assert.equal(body.match(/^event: (.+)$/m)?.[1], expectedEvent);
  return JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? "null");
}

function recorderHeaders(recorderId, extra = {}) {
  return { "x-recorder-id": recorderId, ...extra };
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
    pollTimeoutMs: 20,
    transcriptionUrl: `${upstreamUrl}/v1/audio/transcriptions`,
  });
  const gatewayUrl = await listen(gateway);
  t.after(async () => {
    await close(gateway);
    await close(upstream);
  });

  assert.equal((await register(gatewayUrl, "session-a")).status, 201);
  assert.equal((await register(gatewayUrl, "session-b")).status, 201);
  const startEvents = await connectRecorder(gatewayUrl, "recorder-a");
  assert.equal((await acquireLease(gatewayUrl, "recorder-a")).status, 200);

  const started = await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await started.json(), { state: "recording" });
  const recording = await readSseEvent(startEvents, "recording-start");
  assert.equal(recording.sessionId, "session-a");
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
  assert.match(upstreamBody, /gpt-4o-mini-transcribe/);
  assert.match(upstreamBody, /fake-webm-audio/);
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
