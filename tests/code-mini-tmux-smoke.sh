#!/usr/bin/env bash
set -euo pipefail

tmp=$(mktemp -d /tmp/code-mini-tmux.XXXXXX)
socket=$tmp/tmux.sock
session="code-mini-$$"
code_bin=${CODE_BIN:-/usr/local/bin/code}
data_root=$tmp/data
state_root=$tmp/state
cache_root=$tmp/cache
project_root=$tmp/project

cleanup() {
  timeout 5s tmux -S "$socket" -f /dev/null kill-session -t "$session" >/dev/null 2>&1 || true
  timeout 5s tmux -S "$socket" -f /dev/null kill-server >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir -p "$data_root" "$state_root" "$cache_root" "$project_root"

tmux_cmd() {
  timeout 5s tmux -S "$socket" -f /dev/null "$@"
}

diagnose() {
  local label=$1
  local target=$2

  printf 'FAIL: %s pane did not stay live\n' "$label" >&2
  tmux_cmd list-windows -t "$session" >&2 || true
  tmux_cmd capture-pane -p -t "$target" >&2 || true
}

wait_for_live_pane() {
  local label=$1
  local target=$2
  local deadline=$((SECONDS + 5))
  local pid

  while (( SECONDS < deadline )); do
    pid=$(tmux_cmd display-message -p -t "$target" '#{pane_pid}' 2>/dev/null || true)
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$pid"
      return 0
    fi
    sleep 0.1
  done

  diagnose "$label" "$target"
  return 1
}

assert_pid_live() {
  local label=$1
  local target=$2
  local pid=$3

  if ! kill -0 "$pid" 2>/dev/null; then
    diagnose "$label" "$target"
    return 1
  fi
}

tmux_cmd new-session -d -s "$session" -n tui-a -c "$project_root" \
  env XDG_DATA_HOME="$data_root" XDG_STATE_HOME="$state_root" \
  XDG_CACHE_HOME="$cache_root" "$code_bin" --mini

pane_pid_a=$(wait_for_live_pane 'TUI A' "$session:tui-a")

tmux_cmd new-window -d -t "$session" -n tui-b -c "$project_root" \
  env XDG_DATA_HOME="$data_root" XDG_STATE_HOME="$state_root" \
  XDG_CACHE_HOME="$cache_root" "$code_bin" --mini

pane_pid_b=$(wait_for_live_pane 'TUI B' "$session:tui-b")

sleep 1
assert_pid_live 'TUI A' "$session:tui-a" "$pane_pid_a"
assert_pid_live 'TUI B' "$session:tui-b" "$pane_pid_b"
