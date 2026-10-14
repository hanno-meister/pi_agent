import { createVoiceExtension } from "./extension.js";

const voiceExtension = createVoiceExtension();

export default function extensionLoader(pi) {
  return voiceExtension(pi);
}
