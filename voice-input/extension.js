import { randomUUID } from "node:crypto";

import {
  resolveVoiceConfig,
  supportedTranscriptionModels,
} from "./voice-config.js";

const defaultGatewayUrl = process.env.VOICE_GATEWAY_URL ?? "http://voice-gateway:4317";

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export function createVoiceExtension({
  fetchImpl = fetch,
  gatewayUrl = defaultGatewayUrl,
  registrationIntervalMs = 5000,
  ...configOverrides
} = {}) {
  const defaultConfig = resolveVoiceConfig(configOverrides);
  return function voiceExtension(pi) {
    const sessionId = randomUUID();
    let config = { ...defaultConfig };
    let controller;
    let interactiveContext;

    async function request(path, options = {}) {
      const response = await fetchImpl(`${gatewayUrl}${path}`, options);
      if (!response.ok) {
        let message = `Voice gateway request failed (${response.status})`;
        try {
          const result = await response.json();
          if (typeof result.error === "string") message = result.error;
        } catch {
          // Keep the status-based message when the gateway returns no JSON.
        }
        throw new Error(message);
      }
      return response;
    }

    async function register(ctx, signal, registrationConfig = config) {
      await request("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          label: ctx.cwd,
          config: registrationConfig,
        }),
        signal,
      });
    }

    async function renewRegistration(ctx, signal) {
      while (!signal.aborted) {
        await delay(registrationIntervalMs, signal);
        if (signal.aborted) return;
        try {
          await register(ctx, signal);
        } catch {
          if (!signal.aborted) ctx.ui.setStatus("voice-input", "voice: error");
        }
      }
    }

    async function poll(ctx, signal) {
      while (!signal.aborted) {
        try {
          const response = await request(
            `/api/sessions/${encodeURIComponent(sessionId)}/next`,
            { signal },
          );
          if (response.status === 200) {
            const event = await response.json();
            if (event.type === "transcript" && typeof event.text === "string") {
              ctx.ui.pasteToEditor(event.text);
              ctx.ui.setStatus("voice-input", "voice: ready");
            }
            if (event.type === "error" && typeof event.message === "string") {
              ctx.ui.setStatus("voice-input", "voice: error");
              ctx.ui.notify(event.message, "error");
            }
          }
          await delay(response.status === 204 ? 250 : 0, signal);
        } catch (error) {
          if (signal.aborted) return;
          ctx.ui.setStatus("voice-input", "voice: error");
          await delay(2000, signal);
        }
      }
    }

    async function toggle(ctx) {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("Voice input requires interactive mode", "error");
        return;
      }
      try {
        const response = await request(
          `/api/sessions/${encodeURIComponent(sessionId)}/toggle`,
          { method: "POST" },
        );
        const result = await response.json();
        ctx.ui.setStatus("voice-input", `voice: ${result.state}`);
      } catch (error) {
        ctx.ui.setStatus("voice-input", "voice: error");
        ctx.ui.notify(error.message, "error");
      }
    }

    pi.registerCommand("voice", {
      description: "Start or stop voice dictation",
      handler: async (_args, ctx) => toggle(ctx),
    });

    pi.registerCommand("voice-setup", {
      description: "Choose this session's voice transcription model",
      handler: async (_args, ctx) => {
        if (ctx.mode !== "tui") {
          ctx.ui.notify("Voice setup requires interactive mode", "error");
          return;
        }
        const model = await ctx.ui.select(
          "Voice transcription model",
          supportedTranscriptionModels,
        );
        if (!model) return;
        const selectedConfig = { ...config, model };
        try {
          await register(ctx, controller?.signal, selectedConfig);
          config = selectedConfig;
          ctx.ui.notify(`Voice transcription model: ${model}`, "info");
        } catch (error) {
          ctx.ui.notify(error.message, "error");
        }
      },
    });

    pi.registerShortcut("alt+r", {
      description: "Start or stop voice dictation",
      handler: async (ctx) => toggle(ctx),
    });

    pi.on("session_start", async (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      controller?.abort();
      controller = new AbortController();
      interactiveContext = ctx;
      try {
        await register(ctx, controller.signal);
        ctx.ui.setStatus("voice-input", "voice: ready");
        void poll(ctx, controller.signal);
        void renewRegistration(ctx, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          ctx.ui.setStatus("voice-input", "voice: error");
          ctx.ui.notify(error.message, "error");
        }
      }
    });

    pi.on("session_shutdown", async () => {
      controller?.abort();
      interactiveContext?.ui.setStatus("voice-input", undefined);
      interactiveContext = undefined;
    });
  };
}

export default createVoiceExtension();
