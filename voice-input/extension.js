import { randomUUID } from "node:crypto";

const defaultGatewayUrl = process.env.VOICE_GATEWAY_URL ?? "http://voice-gateway:4317";

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function createVoiceExtension({
  fetchImpl = fetch,
  gatewayUrl = defaultGatewayUrl,
} = {}) {
  return function voiceExtension(pi) {
    const sessionId = randomUUID();
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
        await request("/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: sessionId, label: ctx.cwd }),
          signal: controller.signal,
        });
        ctx.ui.setStatus("voice-input", "voice: ready");
        void poll(ctx, controller.signal);
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
