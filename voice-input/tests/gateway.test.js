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
  server.close();
  await once(server, "close");
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
  const event = body.match(/^event: (.+)$/m)?.[1];
  const data = JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? "null");
  assert.equal(event, expectedEvent);
  return data;
}

test("a recording is transcribed and delivered to the initiating session", async (t) => {
  let upstreamRequest;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    upstreamRequest = {
      method: request.method,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ text: "dictated prompt" }));
  });
  const upstreamUrl = await listen(upstream);

  const gateway = createVoiceGateway({
    apiKey: "test-key",
    transcriptionUrl: `${upstreamUrl}/v1/audio/transcriptions`,
  });
  const gatewayUrl = await listen(gateway);
  t.after(async () => {
    await close(gateway);
    await close(upstream);
  });

  const page = await fetch(gatewayUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Enable microphone/);

  const registered = await fetch(`${gatewayUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "session-a", label: "/workspace/a" }),
  });
  assert.equal(registered.status, 201);

  const browserEvents = await fetch(`${gatewayUrl}/api/browser/events`);
  assert.equal(browserEvents.status, 200);
  assert.equal(
    (await fetch(`${gatewayUrl}/api/browser/armed`, { method: "POST" })).status,
    204,
  );

  const started = await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await started.json(), { state: "recording" });
  assert.deepEqual(await readSseEvent(browserEvents, "recording-start"), {
    sessionId: "session-a",
  });

  const stopEvents = await fetch(`${gatewayUrl}/api/browser/events`);
  const stopped = await fetch(`${gatewayUrl}/api/sessions/session-a/toggle`, {
    method: "POST",
  });
  assert.deepEqual(await stopped.json(), { state: "transcribing" });
  assert.deepEqual(await readSseEvent(stopEvents, "recording-stop"), {
    sessionId: "session-a",
  });

  const deliveryPromise = fetch(`${gatewayUrl}/api/sessions/session-a/next`);
  const uploaded = await fetch(`${gatewayUrl}/api/recordings/session-a`, {
    method: "POST",
    headers: { "content-type": "audio/webm;codecs=opus" },
    body: Buffer.from("fake-webm-audio"),
  });
  assert.equal(uploaded.status, 200);

  const delivery = await deliveryPromise;
  assert.deepEqual(await delivery.json(), {
    type: "transcript",
    text: "dictated prompt",
  });
  assert.equal(upstreamRequest.method, "POST");
  assert.match(upstreamRequest.body, /gpt-4o-mini-transcribe/);
  assert.match(upstreamRequest.body, /fake-webm-audio/);
});
