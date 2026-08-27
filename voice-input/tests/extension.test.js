import assert from "node:assert/strict";
import test from "node:test";

import { createVoiceExtension } from "../extension.js";

function fakePi() {
  const commands = new Map();
  const events = new Map();
  const shortcuts = new Map();
  return {
    commands,
    events,
    shortcuts,
    on(name, handler) {
      events.set(name, handler);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerShortcut(name, definition) {
      shortcuts.set(name, definition);
    },
    sendUserMessage() {
      throw new Error("voice input must not submit a message");
    },
  };
}

function response(status, value) {
  return new Response(value === undefined ? undefined : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function eventually(check) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("condition was not reached");
}

test("the extension pastes transcripts and never submits them", async () => {
  const requests = [];
  let delivered = false;
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next") && !delivered) {
      delivered = true;
      return response(200, { type: "transcript", text: "dictated prompt" });
    }
    if (String(url).endsWith("/next")) return response(204);
    if (String(url).endsWith("/toggle")) return response(200, { state: "recording" });
    throw new Error(`Unexpected request: ${url}`);
  };

  const pi = fakePi();
  createVoiceExtension({ fetchImpl, gatewayUrl: "http://gateway.test" })(pi);
  const pasted = [];
  const statuses = [];
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: {
      notify() {},
      pasteToEditor(text) {
        pasted.push(text);
      },
      setStatus(_name, value) {
        statuses.push(value);
      },
    },
  };

  await pi.events.get("session_start")({}, context);
  await eventually(() => pasted.length === 1);
  assert.deepEqual(pasted, ["dictated prompt"]);
  assert.ok(requests.some((request) => request.url.endsWith("/api/sessions")));

  await pi.commands.get("voice").handler("", context);
  assert.ok(requests.some((request) => request.url.endsWith("/toggle")));
  assert.equal(statuses.at(-1), "voice: recording");
  assert.ok(pi.shortcuts.has("alt+r"));

  await pi.events.get("session_shutdown")({}, context);
});

test("the extension does not start gateway work outside interactive mode", async () => {
  let fetched = false;
  const pi = fakePi();
  createVoiceExtension({
    fetchImpl: async () => {
      fetched = true;
      throw new Error("unexpected fetch");
    },
  })(pi);
  const notifications = [];
  const context = {
    cwd: "/workspace/project",
    mode: "print",
    ui: {
      notify(message) {
        notifications.push(message);
      },
    },
  };

  await pi.events.get("session_start")({}, context);
  await pi.commands.get("voice").handler("", context);
  assert.equal(fetched, false);
  assert.deepEqual(notifications, ["Voice input requires interactive mode"]);
});
