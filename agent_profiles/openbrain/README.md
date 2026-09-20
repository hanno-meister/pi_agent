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

The profile pins only `oh-my-opencode-slim@2.2.21`, disables OMO auto-update,
and loads the plugin from the profile-local `opencode/node_modules/` paths.
There are no MCP servers, presets, extra agents, or model overrides. Package
manifests and the lockfile are tracked; after a clean checkout, install the
profile dependency with:

```sh
cd /pi_agent/agent_profiles/openbrain/opencode
npm ci --ignore-scripts
```

Retained skills under `.agents/skills/`, their lockfiles, and attribution
metadata are unchanged and are exposed through the profile's `skills.paths`
setting. Restart OpenCode after installing or changing profile dependencies.
