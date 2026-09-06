import { createVoiceExtension } from "/pi_agent/voice-input/extension.js";

const voiceExtension = createVoiceExtension();

export default function extensionLoader(pi) {
  return voiceExtension(pi);
}
