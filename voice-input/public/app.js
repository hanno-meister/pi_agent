const status = document.querySelector("#status");
const enable = document.querySelector("#enable");
const toggle = document.querySelector("#toggle");

let armed = false;
let recorder;
let stream;
let chunks = [];
let sessionId;

function show(message, state = "") {
  status.textContent = message;
  status.className = state;
}

async function markArmed() {
  const response = await fetch("/api/browser/armed", { method: "POST" });
  if (!response.ok) throw new Error((await response.json()).error);
}

async function enableMicrophone() {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach((track) => track.stop());
    armed = true;
    await markArmed();
    enable.style.display = "none";
    toggle.style.display = "inline-block";
    show("Ready — use Alt+R or /voice in Pi");
  } catch (error) {
    show(error.message);
  }
}

async function startRecording(targetSession) {
  if (!armed || recorder?.state === "recording") return;
  if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    show("Chrome WebM/Opus recording is unavailable");
    return;
  }
  sessionId = targetSession;
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

function stopRecording() {
  if (recorder?.state !== "recording") return;
  recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  toggle.textContent = "Start recording";
  show("Transcribing…");
}

async function uploadRecording() {
  try {
    const audio = new Blob(chunks, { type: "audio/webm;codecs=opus" });
    const response = await fetch(`/api/recordings/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "content-type": audio.type },
      body: audio,
    });
    if (!response.ok) throw new Error((await response.json()).error);
    show("Inserted into Pi draft");
  } catch (error) {
    show(error.message);
  } finally {
    chunks = [];
    recorder = undefined;
    stream = undefined;
    sessionId = undefined;
  }
}

async function browserToggle() {
  const response = await fetch("/api/browser/toggle", { method: "POST" });
  if (!response.ok) show((await response.json()).error);
}

enable.addEventListener("click", enableMicrophone);
toggle.addEventListener("click", browserToggle);

const events = new EventSource("/api/browser/events");
events.addEventListener("open", async () => {
  enable.disabled = false;
  if (armed) await markArmed();
  else show("Connected — enable microphone");
});
events.addEventListener("recording-start", (event) => {
  startRecording(JSON.parse(event.data).sessionId).catch((error) => show(error.message));
});
events.addEventListener("recording-stop", stopRecording);
events.addEventListener("recording-complete", () => show("Inserted into Pi draft"));
events.addEventListener("recording-error", (event) => show(JSON.parse(event.data).message));
events.addEventListener("error", () => show("Gateway connection lost"));
