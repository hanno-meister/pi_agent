import { audioBitsPerSecond, stopAtDurationLimit } from "./recording-policy.js";

const status = document.querySelector("#status");
const enable = document.querySelector("#enable");
const takeover = document.querySelector("#takeover");
const toggle = document.querySelector("#toggle");
const recovery = document.querySelector("#recovery");

const recorderId = crypto.randomUUID();
let csrfToken;
let armed = false;
let recorder;
let stream;
let chunks = [];
let recordingId;
let leaseTimer;
let recordingTimer;
let discardRecording = false;

function show(message, state = "") {
  status.textContent = message;
  status.className = state;
}

async function browserFetch(path, options = {}) {
  if (!csrfToken) {
    const tokenResponse = await fetch("/api/browser/csrf");
    if (!tokenResponse.ok) throw new Error("Could not secure browser request");
    csrfToken = (await tokenResponse.json()).token;
  }
  return fetch(path, {
    ...options,
    headers: { ...options.headers, "x-csrf-token": csrfToken },
  });
}

async function claimLease(takeoverLease = false) {
  const response = await browserFetch("/api/browser/lease", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: recorderId, takeover: takeoverLease }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
}

function beginLeaseRenewal() {
  clearInterval(leaseTimer);
  leaseTimer = setInterval(async () => {
    try {
      await claimLease();
    } catch (error) {
      armed = false;
      clearInterval(leaseTimer);
      toggle.style.display = "none";
      enable.style.display = "inline-block";
      show(error.message);
    }
  }, 5000);
}

async function enableMicrophone(takeoverLease = false) {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach((track) => track.stop());
    await claimLease(takeoverLease);
    armed = true;
    beginLeaseRenewal();
    enable.style.display = "none";
    takeover.style.display = "none";
    toggle.style.display = "inline-block";
    show("Ready — use Alt+R or /voice in Pi");
  } catch (error) {
    takeover.style.display = error.message.includes("another browser")
      ? "inline-block"
      : "none";
    show(error.message);
  }
}

async function startRecording(targetRecordingId, maxDurationSeconds) {
  if (!armed || recorder?.state === "recording") return;
  if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    show("Chrome WebM/Opus recording is unavailable");
    return;
  }
  recordingId = targetRecordingId;
  discardRecording = false;
  recovery.value = "";
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream, {
    audioBitsPerSecond,
    mimeType: "audio/webm;codecs=opus",
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("stop", uploadRecording, { once: true });
  recorder.start();
  clearTimeout(recordingTimer);
  recordingTimer = setTimeout(
    () => stopAtDurationLimit(() => stopRecording(targetRecordingId)),
    maxDurationSeconds * 1000,
  );
  toggle.textContent = "Stop recording";
  show("Recording…", "recording");
}

function stopRecording(eventRecordingId) {
  if (eventRecordingId !== recordingId || recorder?.state !== "recording") return;
  clearTimeout(recordingTimer);
  recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  toggle.textContent = "Start recording";
  show("Transcribing…");
}

async function uploadRecording() {
  const completedRecordingId = recordingId;
  try {
    if (discardRecording) return;
    const audio = new Blob(chunks, { type: "audio/webm;codecs=opus" });
    const response = await browserFetch(
      `/api/recordings/${encodeURIComponent(completedRecordingId)}`,
      {
        method: "POST",
        headers: {
          "content-type": audio.type,
          "x-recorder-id": recorderId,
        },
        body: audio,
      },
    );
    if (!response.ok) throw new Error((await response.json()).error);
    show("Inserted into Pi draft");
  } catch (error) {
    show(error.message);
  } finally {
    clearTimeout(recordingTimer);
    chunks = [];
    recorder = undefined;
    stream = undefined;
    recordingId = undefined;
  }
}

function discardActiveRecording() {
  if (!recordingId || recorder?.state !== "recording") return;
  const cancelledRecordingId = recordingId;
  discardRecording = true;
  clearTimeout(recordingTimer);
  recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  void browserFetch(`/api/recordings/${encodeURIComponent(cancelledRecordingId)}`, {
    method: "DELETE",
    headers: { "x-recorder-id": recorderId },
  });
  toggle.textContent = "Start recording";
  show("Recording cancelled");
}

async function browserToggle() {
  const response = await browserFetch("/api/browser/toggle", {
    method: "POST",
    headers: { "x-recorder-id": recorderId },
  });
  if (!response.ok) show((await response.json()).error);
}

enable.addEventListener("click", () => enableMicrophone());
takeover.addEventListener("click", () => enableMicrophone(true));
toggle.addEventListener("click", browserToggle);

const events = new EventSource(
  `/api/browser/events?id=${encodeURIComponent(recorderId)}`,
);
events.addEventListener("open", async () => {
  enable.disabled = false;
  takeover.disabled = false;
  if (armed) {
    try {
      await claimLease();
    } catch (error) {
      show(error.message);
    }
  } else {
    show("Connected — enable microphone");
  }
});
events.addEventListener("recording-start", (event) => {
  const data = JSON.parse(event.data);
  startRecording(data.recordingId, data.maxDurationSeconds).catch((error) =>
    show(error.message),
  );
});
events.addEventListener("recording-stop", (event) => {
  stopRecording(JSON.parse(event.data).recordingId);
});
events.addEventListener("recording-complete", () => show("Inserted into Pi draft"));
events.addEventListener("recording-cancelled", () => discardActiveRecording());
events.addEventListener("recording-recovery", (event) => {
  recovery.value = JSON.parse(event.data).text;
  show("Pi session ended — copy the recovered transcript");
});
events.addEventListener("recording-error", (event) => show(JSON.parse(event.data).message));
events.addEventListener("error", () => {
  discardActiveRecording();
  show("Gateway connection lost");
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") discardActiveRecording();
});
window.addEventListener("pagehide", () => discardActiveRecording());
