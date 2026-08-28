#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null; then
  echo "SKIP: Docker is not installed" >&2
  exit 0
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp=$(mktemp -d)
project="pi-agent-smoke-$RANDOM"
compose=(docker compose --env-file /dev/null --project-directory "$tmp/checkout")
cleanup() {
  "${compose[@]}" -p "$project" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

if ! "${compose[@]}" version >/dev/null; then
  echo "SKIP: Docker Compose is not available" >&2
  exit 0
fi

mkdir -p "$tmp/checkout"
tar -C "$root" \
  --exclude=.git --exclude=.env --exclude=.scratch --exclude=node_modules --exclude=graphify-out \
  --exclude=workspaces \
  -cf - . | tar -C "$tmp/checkout" -xf -

# The generic container must start without provider credentials or private-workspace
# configuration.
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  "${compose[@]}" -p "$project" up --build --detach

[ "$("${compose[@]}" -p "$project" ps --status running --services)" = "pi" ]
"${compose[@]}" -p "$project" exec -T pi bash -lc 'test -n "$BASH_VERSION"'
"${compose[@]}" -p "$project" exec -T pi test -L /root/.bashrc
"${compose[@]}" -p "$project" exec -T pi test -L /root/.config/nvim
"${compose[@]}" -p "$project" exec -T pi test -L /root/.config/tmux
"${compose[@]}" -p "$project" exec -T pi sh -c 'test "$(readlink -f /root/.config/nvim)" = /pi_agent/dotfiles/nvim'
"${compose[@]}" -p "$project" exec -T pi sh -c 'test "$(readlink -f /root/.config/tmux)" = /pi_agent/dotfiles/tmux'
"${compose[@]}" -p "$project" exec -T pi sh -c 'test "$(readlink -f /root/.bashrc)" = /pi_agent/dotfiles/bash/bashrc'
"${compose[@]}" -p "$project" exec -T pi sh -c '! test -e /usr/local/bin/hydrate-private-workspace'
"${compose[@]}" -p "$project" exec -T pi sh -c '! test -e /pi_agent/workspaces/second_brain/.git'
"${compose[@]}" -p "$project" exec -T pi sh -c '! git config --global --get user.name && ! git config --global --get user.email'
"${compose[@]}" -p "$project" exec -T pi pi --version
"${compose[@]}" -p "$project" exec -T pi opencode --version

# code scopes OpenCode configuration without changing the test shell's XDG or
# database locations, and enables OMO's background/web capabilities.
"${compose[@]}" -p "$project" exec -T pi sh -c '\
  set -e; \
  mkdir -p /tmp/code-smoke/bin; \
  printf "#!/bin/sh\\nprintf \\\"%%s\\\\n\\\" \\\"\\$@\\\" > /tmp/code-smoke/args\\nenv > /tmp/code-smoke/environment\\n" > /tmp/code-smoke/bin/opencode; \
  chmod +x /tmp/code-smoke/bin/opencode; \
  cd /tmp/code-smoke; \
  XDG_CONFIG_HOME=/tmp/code-smoke/xdg-config-home \
  XDG_DATA_HOME=/tmp/code-smoke/xdg-data-home \
  XDG_STATE_HOME=/tmp/code-smoke/xdg-state-home \
  XDG_CACHE_HOME=/tmp/code-smoke/xdg-cache-home \
  OPENCODE_DB=/tmp/code-smoke/opencode-db \
  PATH=/tmp/code-smoke/bin:$PATH /usr/local/bin/code --profile-test; \
  grep -Fqx -- "--profile-test" /tmp/code-smoke/args; \
  grep -Fqx -- "OPENCODE_CONFIG_DIR=/pi_agent/agent_profiles/code/opencode" /tmp/code-smoke/environment; \
  grep -Fqx -- "XDG_CONFIG_HOME=/tmp/code-smoke/xdg-config-home" /tmp/code-smoke/environment; \
  grep -Fqx -- "XDG_DATA_HOME=/tmp/code-smoke/xdg-data-home" /tmp/code-smoke/environment; \
  grep -Fqx -- "XDG_STATE_HOME=/tmp/code-smoke/xdg-state-home" /tmp/code-smoke/environment; \
  grep -Fqx -- "XDG_CACHE_HOME=/tmp/code-smoke/xdg-cache-home" /tmp/code-smoke/environment; \
  grep -Fqx -- "OPENCODE_DB=/tmp/code-smoke/opencode-db" /tmp/code-smoke/environment; \
  grep -Fqx -- "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true" /tmp/code-smoke/environment; \
  grep -Fqx -- "OPENCODE_ENABLE_EXA=1" /tmp/code-smoke/environment; \
  test -f /pi_agent/agent_profiles/code/opencode/opencode.jsonc; \
  test -f /pi_agent/agent_profiles/code/opencode/tui.jsonc; \
  test "$(readlink /pi_agent/agent_profiles/code/.agents/skills)" = "../opencode/skills"; \
  mkdir -p /pi_agent/agent_profiles/code/.agents/skills/manual-skill; \
  printf '%s\\n' '---' 'name: manual-skill' 'description: A manually installed skill.' '---' > /pi_agent/agent_profiles/code/.agents/skills/manual-skill/SKILL.md; \
  test -f /pi_agent/agent_profiles/code/opencode/skills/manual-skill/SKILL.md; \
  test ! -e /root/.agents/skills/manual-skill; \
  rm -rf /pi_agent/agent_profiles/code/opencode/skills/manual-skill'

# Exercise two concurrent mini TUIs against shared, throwaway XDG roots.
"${compose[@]}" -p "$project" exec -T pi bash /pi_agent/tests/code-mini-tmux-smoke.sh

# pimatt explicitly adds its profile resources but leaves native skill discovery
# enabled, allowing skills in the current project to compose with the profile.
"${compose[@]}" -p "$project" exec -T pi sh -c '\
  set -e; \
  mkdir -p /tmp/pimatt-smoke/bin /tmp/pimatt-smoke/project/.agents/skills/project-skill; \
  printf "#!/bin/sh\\nprintf \\\"%s\\\\n\\\" \\\"\\$@\\\" > /tmp/pimatt-smoke/args\\n" > /tmp/pimatt-smoke/bin/pi; \
  chmod +x /tmp/pimatt-smoke/bin/pi; \
  printf "%s\\n" "---" "name: project-skill" "description: A project skill." "---" > /tmp/pimatt-smoke/project/.agents/skills/project-skill/SKILL.md; \
  cd /tmp/pimatt-smoke/project; \
  PATH=/tmp/pimatt-smoke/bin:$PATH /usr/local/bin/pimatt; \
  grep -Fqx -- "--skill" /tmp/pimatt-smoke/args; \
  grep -Fqx -- "/pi_agent/agent_profiles/pimatt/skills/.agents/skills" /tmp/pimatt-smoke/args; \
  grep -Fqx -- "--prompt-template" /tmp/pimatt-smoke/args; \
  grep -Fqx -- "/pi_agent/agent_profiles/pimatt/skills/.pi/prompts" /tmp/pimatt-smoke/args; \
  ! grep -Fqx -- "--no-skills" /tmp/pimatt-smoke/args'

# pibrain loads the tracked second-brain skills while preserving native discovery.
"${compose[@]}" -p "$project" exec -T pi sh -c '\
  set -e; \
  mkdir -p /tmp/pibrain-smoke/bin; \
  printf "#!/bin/sh\\nprintf \\\"%s\\\\n\\\" \\\"\\$@\\\" > /tmp/pibrain-smoke/args\\n" > /tmp/pibrain-smoke/bin/pi; \
  chmod +x /tmp/pibrain-smoke/bin/pi; \
  PATH=/tmp/pibrain-smoke/bin:$PATH /usr/local/bin/pibrain; \
  grep -Fqx -- "--skill" /tmp/pibrain-smoke/args; \
  grep -Fqx -- "/pi_agent/agent_profiles/pibrain/skills/.agents/skills" /tmp/pibrain-smoke/args; \
  ! grep -Fqx -- "--no-skills" /tmp/pibrain-smoke/args'
