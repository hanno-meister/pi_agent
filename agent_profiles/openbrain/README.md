# Openbrain profile

OpenBrain is a minimal, profile-scoped OpenCode launcher. The host `opencode`
binary is used without changing global configuration, credentials, caches,
packages, or shell startup files.

```sh
cd /pi_agent/workspaces/second_brain
openbrain
```

The launcher scopes HOME, all XDG roots, the OpenCode database, and npm/Bun
caches below `runtime/`, then selects the profile-local config and TUI config.
Project configuration remains enabled. Rebuild the container after changing
the Dockerfile or launcher, and restart OpenCode after changing profile config,
models, or skills.

Both backend and TUI configs pin `oh-my-opencode-slim@2.2.21`. OpenCode resolves
the plugin on first use, so network access is required then. Package-resolution
caches remain isolated under the profile-owned `runtime/` paths above. The OMO
config defines model presets and agent routing; the plugin can also add bundled
MCP servers. Check the resolved configuration and your account's model access
before using a preset.

Retained skills under `.agents/skills/`, their lockfiles, and attribution
metadata are unchanged and are exposed through the profile's `skills.paths`
setting. Restart OpenCode after changing profile configuration, models, or
skills.
