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
  registrationRetryBaseMs = 100,
  registrationRetryMaxMs = 2000,
  cleanupTimeoutMs = 1000,
  ...configOverrides
} = {}) {
  const defaultConfig = resolveVoiceConfig(configOverrides);
  return function voiceExtension(pi) {
    const sessionId = randomUUID();
    let config = { ...defaultConfig };
    let controller;
    let interactiveContext;
    let activeSession;
    let registrationQueue = Promise.resolve();

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

    function enqueueRegistration(
      ctx,
      signal,
      registrationConfig,
      canAttempt = () => true,
      onSuccess,
    ) {
      const queued = registrationQueue.then(async () => {
        if (signal?.aborted || !canAttempt()) return false;
        await register(
          ctx,
          signal,
          typeof registrationConfig === "function"
            ? registrationConfig()
            : registrationConfig,
        );
        onSuccess?.();
        return true;
      });
      registrationQueue = queued.catch(() => {});
      return queued;
    }

    async function registerWithRetry(ctx, signal, session) {
      let retryDelayMs = registrationRetryBaseMs;
      let reportedFailure = false;
      while (!signal.aborted) {
        try {
          const registered = await enqueueRegistration(
            ctx,
            signal,
            session.registrationConfig,
            () => session.registrationOperation.active,
          );
          if (registered) {
            session.registered = true;
            return true;
          }
          return false;
        } catch (error) {
          if (signal.aborted) return false;
          ctx.ui.setStatus("voice-input", "voice: error");
          if (!reportedFailure) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(message, "error");
            reportedFailure = true;
          }
          await delay(retryDelayMs, signal);
          retryDelayMs = Math.min(retryDelayMs * 2, registrationRetryMaxMs);
        }
      }
      return false;
    }

    async function renewRegistration(ctx, signal) {
      while (!signal.aborted) {
        await delay(registrationIntervalMs, signal);
        if (signal.aborted) return;
        try {
          await enqueueRegistration(ctx, signal, () => config);
        } catch {
          if (!signal.aborted) ctx.ui.setStatus("voice-input", "voice: error");
        }
      }
    }

    function startBackgroundWork(ctx, session) {
      if (
        session.controller.signal.aborted ||
        activeSession !== session ||
        session.backgroundStarted
      ) {
        return;
      }
      session.backgroundStarted = true;
      ctx.ui.setStatus("voice-input", "voice: ready");
      void poll(ctx, session.controller.signal);
      void renewRegistration(ctx, session.controller.signal);
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
        const session = activeSession;
        const signal = session?.controller.signal;
        try {
          const registered = await enqueueRegistration(
            ctx,
            signal,
            selectedConfig,
            () => !signal?.aborted,
            () => {
              if (session && activeSession !== session) return;
              config = selectedConfig;
              if (session) {
                session.registered = true;
                session.registrationOperation.active = false;
                startBackgroundWork(ctx, session);
              }
            },
          );
          if (!registered) return;
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

    async function startSession(ctx, session) {
      try {
        const registered = await registerWithRetry(
          ctx,
          session.controller.signal,
          session,
        );
        if (
          !registered ||
          session.controller.signal.aborted ||
          activeSession !== session ||
          !session.registrationOperation.active
        ) {
          return;
        }
        startBackgroundWork(ctx, session);
      } catch (error) {
        if (!session.controller.signal.aborted && activeSession === session) {
          ctx.ui.setStatus("voice-input", "voice: error");
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      }
    }

    pi.on("session_start", async (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      controller?.abort();
      if (activeSession) activeSession.registrationOperation.active = false;
      const sessionController = new AbortController();
      controller = sessionController;
      activeSession = {
        controller: sessionController,
        registrationConfig: { ...config },
        registrationOperation: { active: true },
        registered: false,
        backgroundStarted: false,
      };
      interactiveContext = ctx;
      void startSession(ctx, activeSession);
    });

    pi.on("session_shutdown", async () => {
      const session = activeSession;
      controller?.abort();
      if (session) session.registrationOperation.active = false;
      if (session?.registered) {
        const cleanupController = new AbortController();
        let cleanupTimer;
        const cleanupTimeout = new Promise((resolve) => {
          cleanupTimer = setTimeout(() => {
            cleanupController.abort();
            resolve();
          }, cleanupTimeoutMs);
        });
        try {
          const deletion = request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: "DELETE",
            signal: cleanupController.signal,
          }).catch(() => {});
          await Promise.race([deletion, cleanupTimeout]);
        } finally {
          clearTimeout(cleanupTimer);
        }
      }
      activeSession = undefined;
      interactiveContext?.ui.setStatus("voice-input", undefined);
      interactiveContext = undefined;
    });
  };
}

export default createVoiceExtension();
