import { audioBitsPerSecond, stopAtDurationLimit } from "./recording-policy.js";

const status = document.querySelector("#status");
const enable = document.querySelector("#enable");
const takeover = document.querySelector("#takeover");
const toggle = document.querySelector("#toggle");
const recovery = document.querySelector("#recovery");

const recorderId = crypto.randomUUID();
let csrfToken;
let armed = false;
let activeAttempt;
let leaseTimer;

function show(message, state = "") {
  status.textContent = message;
  status.className = state;
}

async function browserFetch(path, options = {}, retried = false) {
  if (!csrfToken) {
    const tokenResponse = await fetch("/api/browser/csrf");
    if (!tokenResponse.ok) throw new Error("Could not secure browser request");
    csrfToken = (await tokenResponse.json()).token;
  }
  const response = await fetch(path, {
    ...options,
    headers: { ...options.headers, "x-csrf-token": csrfToken },
  });
  if (response.status === 403 && !retried) {
    csrfToken = undefined;
    return browserFetch(path, options, true);
  }
  return response;
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
  if (!armed || activeAttempt) return;
  const attempt = {
    recordingId: targetRecordingId,
    stream: undefined,
    recorder: undefined,
    chunks: [],
    timer: undefined,
    cancelled: false,
    cancelRequest: undefined,
    tracksReleased: false,
    abortController: new AbortController(),
  };
  activeAttempt = attempt;
  recovery.value = "";
  try {
    if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      throw new Error("Chrome WebM/Opus recording is unavailable");
    }
    attempt.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (attempt.cancelled) {
      releaseAttemptTracks(attempt);
      return;
    }
    attempt.recorder = new MediaRecorder(attempt.stream, {
      audioBitsPerSecond,
      mimeType: "audio/webm;codecs=opus",
    });
    attempt.recorder.addEventListener("dataavailable", (event) => {
      if (!attempt.cancelled && event.data.size > 0) attempt.chunks.push(event.data);
    });
    attempt.recorder.addEventListener("stop", () => uploadRecording(attempt), { once: true });
    attempt.recorder.start();
    attempt.timer = setTimeout(
      () => stopAtDurationLimit(() => stopRecording(attempt.recordingId)),
      maxDurationSeconds * 1000,
    );
    toggle.textContent = "Stop recording";
    show("Recording…", "recording");
  } catch (error) {
    if (!attempt.cancelled) failAttempt(attempt, error);
  }
}

function stopRecording(eventRecordingId) {
  const attempt = activeAttempt;
  if (!attempt || eventRecordingId !== attempt.recordingId) return;
  if (attempt.recorder?.state !== "recording") {
    if (!attempt.recorder) cancelAttempt(attempt);
    return;
  }
  clearTimeout(attempt.timer);
  attempt.recorder.stop();
  releaseAttemptTracks(attempt);
  toggle.textContent = "Start recording";
  show("Transcribing…");
}

async function uploadRecording(attempt) {
  try {
    if (attempt.cancelled) return;
    if (attempt.chunks.length === 0) {
      cancelAttempt(attempt);
      return;
    }
    const audio = new Blob(attempt.chunks, { type: "audio/webm;codecs=opus" });
    const response = await browserFetch(
      `/api/recordings/${encodeURIComponent(attempt.recordingId)}`,
      {
        method: "POST",
        headers: {
          "content-type": audio.type,
          "x-recorder-id": recorderId,
        },
        body: audio,
        signal: attempt.abortController.signal,
      },
    );
    if (!response.ok) throw new Error((await response.json()).error);
    if (!attempt.cancelled) show("Inserted into Pi draft");
  } catch (error) {
    if (!attempt.cancelled) show(error.message);
  } finally {
    clearTimeout(attempt.timer);
    releaseAttemptTracks(attempt);
    if (activeAttempt === attempt) activeAttempt = undefined;
  }
}

function releaseAttemptTracks(attempt) {
  if (attempt.tracksReleased || !attempt.stream) return;
  attempt.tracksReleased = true;
  attempt.stream?.getTracks().forEach((track) => track.stop());
}

function cancelAttempt(attempt) {
  if (attempt.cancelled) return attempt.cancelRequest;
  attempt.cancelled = true;
  clearTimeout(attempt.timer);
  releaseAttemptTracks(attempt);
  attempt.abortController.abort();
  if (attempt.recorder?.state === "recording") attempt.recorder.stop();
  attempt.cancelRequest = browserFetch(
    `/api/recordings/${encodeURIComponent(attempt.recordingId)}`,
    { method: "DELETE", headers: { "x-recorder-id": recorderId } },
  ).catch(() => {});
  if (activeAttempt === attempt) activeAttempt = undefined;
  toggle.textContent = "Start recording";
  show("Recording cancelled");
  return attempt.cancelRequest;
}

function failAttempt(attempt, error) {
  cancelAttempt(attempt);
  show(error.message);
}

function discardActiveRecording() {
  if (activeAttempt) cancelAttempt(activeAttempt);
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
