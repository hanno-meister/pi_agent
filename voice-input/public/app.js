const status = document.querySelector("#status");
const enable = document.querySelector("#enable");
const takeover = document.querySelector("#takeover");
const toggle = document.querySelector("#toggle");

const recorderId = crypto.randomUUID();
let armed = false;
let recorder;
let stream;
let chunks = [];
let recordingId;
let leaseTimer;

function show(message, state = "") {
  status.textContent = message;
  status.className = state;
}

async function claimLease(takeoverLease = false) {
  const response = await fetch("/api/browser/lease", {
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

async function startRecording(targetRecordingId) {
  if (!armed || recorder?.state === "recording") return;
  if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    show("Chrome WebM/Opus recording is unavailable");
    return;
  }
  recordingId = targetRecordingId;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("stop", uploadRecording, { once: true });
  recorder.start();
  toggle.textContent = "Stop recording";
  show("Recording…", "recording");
}

function stopRecording(eventRecordingId) {
  if (eventRecordingId !== recordingId || recorder?.state !== "recording") return;
  recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  toggle.textContent = "Start recording";
  show("Transcribing…");
}

async function uploadRecording() {
  const completedRecordingId = recordingId;
  try {
    const audio = new Blob(chunks, { type: "audio/webm;codecs=opus" });
    const response = await fetch(
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
    chunks = [];
    recorder = undefined;
    stream = undefined;
    recordingId = undefined;
  }
}

async function browserToggle() {
  const response = await fetch("/api/browser/toggle", {
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
  startRecording(data.recordingId).catch((error) => show(error.message));
});
events.addEventListener("recording-stop", (event) => {
  stopRecording(JSON.parse(event.data).recordingId);
});
events.addEventListener("recording-complete", () => show("Inserted into Pi draft"));
events.addEventListener("recording-error", (event) => show(JSON.parse(event.data).message));
events.addEventListener("error", () => show("Gateway connection lost"));
