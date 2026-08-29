export const supportedTranscriptionModels = Object.freeze([
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
]);

export const defaultVoiceConfig = Object.freeze({
  language: "en",
  maxDurationSeconds: 120,
  model: supportedTranscriptionModels[0],
});

export function resolveVoiceConfig(overrides = {}, environment = process.env) {
  return validateVoiceConfig({
    language: overrides.language ?? environment.VOICE_LANGUAGE ?? defaultVoiceConfig.language,
    maxDurationSeconds: Number(
      overrides.maxDurationSeconds ??
        environment.VOICE_MAX_DURATION_SECONDS ??
        defaultVoiceConfig.maxDurationSeconds,
    ),
    model:
      overrides.model ??
      environment.VOICE_TRANSCRIPTION_MODEL ??
      defaultVoiceConfig.model,
  });
}

export function validateVoiceConfig(config, maximumDurationSeconds = 3600) {
  if (!supportedTranscriptionModels.includes(config.model)) {
    throw new Error(`Unsupported voice transcription model: ${config.model}`);
  }
  if (typeof config.language !== "string" || !/^[a-z]{2}$/.test(config.language)) {
    throw new Error(`VOICE_LANGUAGE must be a two-letter language code: ${config.language}`);
  }
  if (
    !Number.isInteger(config.maxDurationSeconds) ||
    config.maxDurationSeconds < 1 ||
    config.maxDurationSeconds > maximumDurationSeconds
  ) {
    throw new Error(
      `VOICE_MAX_DURATION_SECONDS must be an integer from 1 to ${maximumDurationSeconds}`,
    );
  }
  return config;
}
