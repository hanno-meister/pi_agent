#!/bin/sh
set -eu

# Install into the runtime-mounted Pi configuration volume.
graphify install --platform pi

git config --global --replace-all safe.directory /pi_agent

if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

mkdir -p /root/.config
rm -f /root/.bashrc
rm -rf /root/.config/nvim /root/.config/tmux
ln -s /pi_agent/dotfiles/bash/bashrc /root/.bashrc
ln -s /pi_agent/dotfiles/nvim /root/.config/nvim
ln -s /pi_agent/dotfiles/tmux /root/.config/tmux

exec "$@"
