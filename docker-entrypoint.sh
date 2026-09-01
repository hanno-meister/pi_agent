#!/bin/sh
set -eu

# Install into the runtime-mounted Pi configuration volume.
graphify install --platform pi

# Generate Graphify's OpenCode-specific skill inside the code profile. Graphify's
# project installer has no custom destination flag, so use a transient project
# whose skill directory points at the profile and discard its project hook files.
code_skills=/pi_agent/agent_profiles/code/opencode/skills
if [ -d "$code_skills" ]; then
  graphify_stage=$(mktemp -d)
  mkdir -p "$graphify_stage/.opencode"
  ln -s "$code_skills" "$graphify_stage/.opencode/skills"
  if ! (
    cd "$graphify_stage"
    graphify install --project --platform opencode >/dev/null
  ); then
    rm -rf "$graphify_stage"
    exit 1
  fi
  rm -rf "$graphify_stage"
fi

# The repository is mounted after the image is built. Keep the runtime launcher
# synchronized with the mounted source instead of using a stale image copy.
if [ -f /pi_agent/agent_profiles/code/code ]; then
  cp /pi_agent/agent_profiles/code/code /usr/local/bin/code
  chmod 0755 /usr/local/bin/code
fi

git config --global --replace-all safe.directory /pi_agent

if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

mkdir -p /root/.config /root/.ssh /root/.pi/agent/extensions
chmod 700 /root/.ssh
rm -f /root/.pi/agent/extensions/voice-input.js
ln -s /pi_agent/voice-input/extension-loader.js /root/.pi/agent/extensions/voice-input.js
rm -f /root/.bashrc
rm -rf /root/.config/nvim /root/.config/tmux
ln -s /pi_agent/dotfiles/bash/bashrc /root/.bashrc
ln -s /pi_agent/dotfiles/nvim /root/.config/nvim
ln -s /pi_agent/dotfiles/tmux /root/.config/tmux

exec "$@"
