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

test("session shutdown waits for gateway session deletion", async () => {
  const requests = [];
  let deleteSignal;
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      return response(201, { registered: true });
    }
    if (options.method === "DELETE") {
      deleteSignal = options.signal;
      return new Promise(() => {});
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: { notify() {}, pasteToEditor() {}, setStatus() {} },
  };
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    cleanupTimeoutMs: 10,
  })(pi);

  await pi.events.get("session_start")({}, context);
  await eventually(() => requests.some(({ method }) => method === "POST"));
  await new Promise((resolve) => setImmediate(resolve));
  const shutdown = pi.events.get("session_shutdown")({}, context);
  await eventually(() => requests.some(({ method }) => method === "DELETE"));
  let settled = false;
  shutdown.then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  await shutdown;
  assert.equal(deleteSignal.aborted, true);
  assert.equal(
    requests.filter(({ method }) => method === "DELETE").length,
    1,
  );
});

test("session shutdown does not delete an unregistered voice session", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      return response(503, { error: "gateway unavailable" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: { notify() {}, pasteToEditor() {}, setStatus() {} },
  };
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    registrationRetryBaseMs: 1000,
  })(pi);

  await pi.events.get("session_start")({}, context);
  await new Promise((resolve) => setImmediate(resolve));
  await pi.events.get("session_shutdown")({}, context);
  assert.equal(requests.some(({ method }) => method === "DELETE"), false);
});

test("session start returns while registration retries and recovers delivery", async () => {
  let registrationAttempts = 0;
  let delivered = false;
  let gatewayAvailable = false;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      registrationAttempts += 1;
      return gatewayAvailable
        ? response(201, { registered: true })
        : response(503, { error: "gateway unavailable" });
    }
    if (String(url).endsWith("/next") && !delivered) {
      delivered = true;
      return response(200, { type: "transcript", text: "recovered prompt" });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  const pasted = [];
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: {
      notify() {},
      pasteToEditor(text) {
        pasted.push(text);
      },
      setStatus() {},
    },
  };
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    registrationRetryBaseMs: 10,
    registrationRetryMaxMs: 10,
  })(pi);

  let sessionStartSettled = false;
  const sessionStart = pi.events.get("session_start")({}, context);
  sessionStart.then(() => {
    sessionStartSettled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sessionStartSettled, true);
  assert.equal(registrationAttempts, 1);
  gatewayAvailable = true;
  await eventually(() => pasted.length === 1);
  assert.equal(registrationAttempts, 2);
  assert.deepEqual(pasted, ["recovered prompt"]);
  await pi.events.get("session_shutdown")({}, context);
});

test("interactive extension instances register distinct identities and renew them", async () => {
  const registrations = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      registrations.push(JSON.parse(options.body));
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: { notify() {}, pasteToEditor() {}, setStatus() {} },
  };
  const first = fakePi();
  const second = fakePi();
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    registrationIntervalMs: 10,
  })(first);
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    registrationIntervalMs: 10,
  })(second);

  await first.events.get("session_start")({}, context);
  await second.events.get("session_start")({}, context);
  await eventually(() => registrations.length >= 4);
  const ids = new Set(registrations.map(({ id }) => id));
  assert.equal(ids.size, 2);
  for (const id of ids) {
    assert.ok(registrations.filter((registration) => registration.id === id).length >= 2);
  }

  await first.events.get("session_shutdown")({}, context);
  await second.events.get("session_shutdown")({}, context);
});

test("voice setup selects a supported model for only the current session", async () => {
  const registrations = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      registrations.push(JSON.parse(options.body));
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const makeContext = (choice) => ({
    cwd: "/workspace/project",
    mode: "tui",
    ui: {
      notify() {},
      pasteToEditor() {},
      select: async (_title, choices) => {
        assert.deepEqual(choices, [
          "gpt-4o-mini-transcribe",
          "gpt-4o-transcribe",
          "whisper-1",
        ]);
        return choice;
      },
      setStatus() {},
    },
  });
  const first = fakePi();
  const second = fakePi();
  createVoiceExtension({ fetchImpl, gatewayUrl: "http://gateway.test" })(first);
  createVoiceExtension({ fetchImpl, gatewayUrl: "http://gateway.test" })(second);

  await first.events.get("session_start")({}, makeContext("gpt-4o-transcribe"));
  await second.events.get("session_start")({}, makeContext("whisper-1"));
  await first.commands.get("voice-setup").handler("", makeContext("gpt-4o-transcribe"));
  await eventually(() => registrations.length >= 3);

  const [firstInitial, secondInitial, firstUpdated] = registrations;
  assert.deepEqual(firstInitial.config, {
    language: "en",
    maxDurationSeconds: 120,
    model: "gpt-4o-mini-transcribe",
  });
  assert.deepEqual(secondInitial.config, firstInitial.config);
  assert.equal(firstUpdated.id, firstInitial.id);
  assert.equal(firstUpdated.config.model, "gpt-4o-transcribe");
  assert.notEqual(firstInitial.id, secondInitial.id);

  await first.events.get("session_shutdown")();
  await second.events.get("session_shutdown")();
});

test("voice setup wins over a delayed initial registration in either ordering", async () => {
  const runRace = async (setupWhileInitialIsDelayed) => {
    let initialStarted;
    const initialStartedPromise = new Promise((resolve) => {
      initialStarted = resolve;
    });
    let releaseInitial;
    const initialRelease = new Promise((resolve) => {
      releaseInitial = resolve;
    });
    let registrationCount = 0;
    let activeRegistrations = 0;
    let maxActiveRegistrations = 0;
    const registrations = [];
    let gatewayRegistration;
    const fetchImpl = async (url, options = {}) => {
      if (String(url).endsWith("/api/sessions") && options.method === "POST") {
        registrationCount += 1;
        activeRegistrations += 1;
        maxActiveRegistrations = Math.max(maxActiveRegistrations, activeRegistrations);
        try {
          const registration = JSON.parse(options.body);
          registrations.push(registration);
          if (registrationCount === 1) {
            initialStarted();
            await initialRelease;
          }
          gatewayRegistration = registration;
          return response(201, { registered: true });
        } finally {
          activeRegistrations -= 1;
        }
      }
      if (String(url).endsWith("/next")) return response(204);
      throw new Error(`Unexpected request: ${url}`);
    };
    const pi = fakePi();
    const context = {
      cwd: "/workspace/project",
      mode: "tui",
      ui: {
        notify() {},
        pasteToEditor() {},
        select: async () => "whisper-1",
        setStatus() {},
      },
    };
    createVoiceExtension({
      fetchImpl,
      gatewayUrl: "http://gateway.test",
      registrationIntervalMs: 100000,
    })(pi);

    await pi.events.get("session_start")({}, context);
    await initialStartedPromise;
    let setupPromise;
    if (setupWhileInitialIsDelayed) {
      setupPromise = pi.commands.get("voice-setup").handler("", context);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(registrationCount, 1);
    }
    releaseInitial();
    if (!setupPromise) {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(registrationCount, 1);
      setupPromise = pi.commands.get("voice-setup").handler("", context);
    }
    await setupPromise;
    assert.equal(registrations[0].config.model, "gpt-4o-mini-transcribe");
    assert.equal(registrations[1].config.model, "whisper-1");
    assert.equal(gatewayRegistration.config.model, "whisper-1");
    assert.equal(maxActiveRegistrations, 1);
    await pi.events.get("session_shutdown")();
  };

  await runRace(true);
  await runRace(false);
});

test("a failed voice setup does not change the session model", async () => {
  const registrations = [];
  let failSetup = false;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions")) {
      registrations.push(JSON.parse(options.body));
      if (failSetup) {
        failSetup = false;
        return response(503, { error: "gateway unavailable" });
      }
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    registrationIntervalMs: 10,
  })(pi);
  const notifications = [];
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: {
      notify(message) {
        notifications.push(message);
      },
      pasteToEditor() {},
      select: async () => "whisper-1",
      setStatus() {},
    },
  };

  await pi.events.get("session_start")({}, context);
  failSetup = true;
  await pi.commands.get("voice-setup").handler("", context);
  await eventually(() => registrations.length >= 3);
  assert.equal(registrations[1].config.model, "whisper-1");
  assert.equal(registrations[2].config.model, "gpt-4o-mini-transcribe");
  assert.deepEqual(notifications, ["gateway unavailable"]);
  await pi.events.get("session_shutdown")();
});

test("voice configuration defaults, overrides, and invalid values are explicit", async () => {
  const registrations = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions")) {
      registrations.push(JSON.parse(options.body));
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  createVoiceExtension({
    fetchImpl,
    gatewayUrl: "http://gateway.test",
    language: "de",
    maxDurationSeconds: 45,
    model: "whisper-1",
  })(pi);
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: { notify() {}, pasteToEditor() {}, setStatus() {} },
  };
  await pi.events.get("session_start")({}, context);
  assert.deepEqual(registrations[0].config, {
    language: "de",
    maxDurationSeconds: 45,
    model: "whisper-1",
  });
  await pi.events.get("session_shutdown")();

  const previousEnvironment = {
    language: process.env.VOICE_LANGUAGE,
    maxDuration: process.env.VOICE_MAX_DURATION_SECONDS,
    model: process.env.VOICE_TRANSCRIPTION_MODEL,
  };
  process.env.VOICE_LANGUAGE = "fr";
  process.env.VOICE_MAX_DURATION_SECONDS = "30";
  process.env.VOICE_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
  const environmentPi = fakePi();
  try {
    createVoiceExtension({ fetchImpl, gatewayUrl: "http://gateway.test" })(
      environmentPi,
    );
  } finally {
    for (const [name, value] of [
      ["VOICE_LANGUAGE", previousEnvironment.language],
      ["VOICE_MAX_DURATION_SECONDS", previousEnvironment.maxDuration],
      ["VOICE_TRANSCRIPTION_MODEL", previousEnvironment.model],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  await environmentPi.events.get("session_start")({}, context);
  assert.deepEqual(registrations.at(-1).config, {
    language: "fr",
    maxDurationSeconds: 30,
    model: "gpt-4o-transcribe",
  });
  await environmentPi.events.get("session_shutdown")();

  assert.throws(
    () => createVoiceExtension({ model: "unknown-model" }),
    /Unsupported voice transcription model/,
  );
  assert.throws(
    () => createVoiceExtension({ language: "english" }),
    /VOICE_LANGUAGE must be a two-letter language code/,
  );
  assert.throws(
    () => createVoiceExtension({ maxDurationSeconds: 0 }),
    /VOICE_MAX_DURATION_SECONDS must be an integer from 1 to 3600/,
  );
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

test("the extension shows provider recovery errors without retrying transcription", async () => {
  let delivered = false;
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/sessions") && options.method === "POST") {
      return response(201, { registered: true });
    }
    if (String(url).endsWith("/next") && !delivered) {
      delivered = true;
      return response(200, {
        type: "error",
        message: "Voice transcription failed; check OpenAI access and try again",
      });
    }
    if (String(url).endsWith("/next")) return response(204);
    throw new Error(`Unexpected request: ${url}`);
  };
  const pi = fakePi();
  const notifications = [];
  const statuses = [];
  const context = {
    cwd: "/workspace/project",
    mode: "tui",
    ui: {
      notify(message) { notifications.push(message); },
      pasteToEditor() {},
      setStatus(_name, value) { statuses.push(value); },
    },
  };
  createVoiceExtension({ fetchImpl, gatewayUrl: "http://gateway.test" })(pi);
  await pi.events.get("session_start")({}, context);
  await eventually(() => notifications.length === 1);
  assert.deepEqual(notifications, ["Voice transcription failed; check OpenAI access and try again"]);
  assert.equal(statuses.at(-1), "voice: error");
  await pi.events.get("session_shutdown")({}, context);
});
