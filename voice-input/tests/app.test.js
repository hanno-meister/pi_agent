import assert from "node:assert/strict";
import test from "node:test";

function response(status, value) {
  return new Response(value === undefined ? undefined : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("browser recording attempts cancel pending and failed starts without uploading", async () => {
  const elements = new Map();
  for (const id of ["status", "enable", "takeover", "toggle", "recovery"]) {
    elements.set(id, {
      style: {}, value: "", textContent: "", disabled: false,
      addEventListener(name, handler) { this[`on${name}`] = handler; },
    });
  }
  const listeners = new Map();
  const eventSource = { addEventListener(name, handler) { listeners.set(name, handler); } };
  const permissions = [];
  const requests = [];
  let csrfRequests = 0;
  let expireNextMutation = true;
  let uploadPending = false;
  let resolveUpload;
  let Recorder = class { static isTypeSupported() { return true; } };
  const old = {
    document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator,
    MediaRecorder: globalThis.MediaRecorder, EventSource: globalThis.EventSource,
    fetch: globalThis.fetch,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
  };
  globalThis.document = { querySelector(selector) { return elements.get(selector.slice(1)); } };
  globalThis.window = { addEventListener(name, handler) { this[`on${name}`] = handler; } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    mediaDevices: { getUserMedia() { return permissions.shift(); } },
  } });
  globalThis.EventSource = function () { return eventSource; };
  globalThis.MediaRecorder = Recorder;
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET", headers: options.headers, signal: options.signal });
    if (String(url).endsWith("/csrf")) {
      csrfRequests++;
      return response(200, { token: `csrf-${csrfRequests}` });
    }
    if (expireNextMutation && options.method && options.method !== "GET") {
      expireNextMutation = false;
      return response(403, { error: "expired token" });
    }
    if (uploadPending && options.method === "POST" && String(url).includes("/recordings/")) {
      return new Promise((resolve) => { resolveUpload = resolve; });
    }
    return response(200, {});
  };
  try {
    await import(`../public/app.js?test=${Date.now()}`);
    await listeners.get("open")();
    permissions.push(Promise.resolve({ getTracks: () => [] }));
    await elements.get("enable").onclick();
    assert.equal(requests.filter((request) => request.url.endsWith("/lease")).length, 2);
    assert.equal(csrfRequests, 2);
    globalThis.MediaRecorder = class { static isTypeSupported() { return false; } };
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "codec", maxDurationSeconds: 10 }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 1);
    globalThis.MediaRecorder = Recorder;
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    permissions.push(pending);
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "pending", maxDurationSeconds: 10 }) });
    globalThis.window.onkeydown({ key: "Escape" });
    await Promise.resolve();
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 2);
    Recorder = class {
      static isTypeSupported() { return true; }
      constructor() { throw new Error("constructor failed"); }
    };
    globalThis.MediaRecorder = Recorder;
    const pendingTrack = { stopped: 0, stop() { this.stopped++; } };
    release({ getTracks: () => [pendingTrack] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(pendingTrack.stopped, 1);
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.includes("/recordings/")).length, 0);

    const failedTrack = { stopped: 0, stop() { this.stopped++; } };
    permissions.push(Promise.resolve({ getTracks: () => [failedTrack] }));
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "constructor", maxDurationSeconds: 10 }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(failedTrack.stopped, 1);
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 3);

    class StartFailureRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = "inactive"; }
      addEventListener() {}
      start() { throw new Error("start failed"); }
    }
    globalThis.MediaRecorder = StartFailureRecorder;
    const startTrack = { stopped: 0, stop() { this.stopped++; } };
    permissions.push(Promise.resolve({ getTracks: () => [startTrack] }));
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "start", maxDurationSeconds: 10 }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(startTrack.stopped, 1);
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 4);

    let successfulRecorder;
    class SuccessfulRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = "inactive"; successfulRecorder = this; }
      addEventListener(name, handler) { this[`on${name}`] = handler; }
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"]) });
        this.onstop?.();
      }
    }
    globalThis.MediaRecorder = SuccessfulRecorder;
    uploadPending = true;
    permissions.push(Promise.resolve({ getTracks: () => [] }));
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "upload-cancel", maxDurationSeconds: 10 }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await listeners.get("recording-stop")({ data: JSON.stringify({ recordingId: "upload-cancel" }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const uploadRequest = requests.find((request) => request.url.includes("upload-cancel"));
    assert.equal(uploadRequest.signal.aborted, false);
    globalThis.window.onkeydown({ key: "Escape" });
    assert.equal(uploadRequest.signal.aborted, true);
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 5);
    resolveUpload(response(200, {}));
    uploadPending = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(elements.get("status").textContent, "Recording cancelled");

    const successfulTrack = { stopped: 0, stop() { this.stopped++; } };
    permissions.push(Promise.resolve({ getTracks: () => [successfulTrack] }));
    await listeners.get("recording-start")({ data: JSON.stringify({ recordingId: "success", maxDurationSeconds: 10 }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(successfulRecorder.state, "recording");
    await listeners.get("recording-stop")({ data: JSON.stringify({ recordingId: "success" }) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(successfulTrack.stopped, 1);
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.includes("/recordings/")).length, 2);
  } finally {
    globalThis.document = old.document;
    globalThis.window = old.window;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: old.navigator });
    globalThis.MediaRecorder = old.MediaRecorder;
    globalThis.EventSource = old.EventSource;
    globalThis.fetch = old.fetch;
    globalThis.setInterval = old.setInterval;
    globalThis.clearInterval = old.clearInterval;
  }
});
