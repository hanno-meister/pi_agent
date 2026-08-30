#!/usr/bin/env bash
set -u
umask 077

# Disposable Herdr human pilot. Runtime files stay below this prototype directory.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SESSION=hp
# Keep these names short: UNIX-domain socket paths have a small platform limit.
HOME_DIR="$ROOT/.h"
XDG_DIR="$ROOT/.x"
CONFIG="$ROOT/c.toml"
STATE="$ROOT/.s"
IDS="$STATE/ids.env"
EVIDENCE="$ROOT/evidence.md"
PROFILE=/pi_agent/agent_profiles/code/opencode
PI_AGENT_DIR=${PI_CODING_AGENT_DIR:-/root/.pi/agent}

die() { printf 'pilot: %s\n' "$*" >&2; exit 1; }
safe_id() { [[ ${1:-} =~ ^[a-z][a-z0-9:_-]{0,63}$ ]]; }

select_asset() {
  # HERDR_TEST_UNAME_S/M are a non-invasive test seam; normal runs use uname.
  local os=${HERDR_TEST_UNAME_S:-$(uname -s 2>/dev/null || true)}
  local arch=${HERDR_TEST_UNAME_M:-$(uname -m 2>/dev/null || true)}
  case "$os:$arch" in
    Linux:x86_64)
      ASSET=herdr-linux-x86_64
      EXPECTED_SHA=976150a14d490c94b243ea2e1a7eb2dfb67f12e36b182db90936f6728e6aecf4
      ;;
    Linux:aarch64)
      ASSET=herdr-linux-aarch64
      EXPECTED_SHA=f55610658e1c2e0d2aaef730b4b2ab885f7f8ba00285ab372bfb14f2e3d5b40d
      ;;
    Darwin:arm64)
      ASSET=herdr-macos-aarch64
      EXPECTED_SHA=a5d4f4d504d8b309c91f811050559300faba31258425f53c50852fc96f6ae574
      ;;
    Darwin:x86_64)
      ASSET=herdr-macos-x86_64
      EXPECTED_SHA=ab50262c8190cd7aa9056d249d255c08c328c3e8716de9cfa29db4f131b8e2c1
      ;;
    *)
      die "unsupported Herdr platform: uname -s=$os uname -m=$arch"
      ;;
  esac
  PLATFORM_OS=$os
  PLATFORM_ARCH=$arch
  BIN="$ROOT/$ASSET"
  URL="https://github.com/herdrdev/herdr/releases/download/v0.8.2/$ASSET"
}

select_asset

now_ms() {
  local raw seconds
  raw=$(date +%s%3N 2>/dev/null || true)
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$raw"
    return 0
  fi
  seconds=$(date +%s 2>/dev/null || true)
  [[ "$seconds" =~ ^[0-9]+$ ]] || seconds=0
  printf '%s000\n' "$seconds"
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    die 'sha256sum or shasum is required'
  fi
}

verify_binary() {
  if [[ ! -e "$BIN" ]]; then
    command -v curl >/dev/null 2>&1 || die 'curl is required to download Herdr'
    printf 'pilot: downloading Herdr v0.8.2\n'
    curl -fL --retry 2 --output "$BIN" "$URL" || die 'Herdr download failed'
    chmod 700 "$BIN"
  fi
  [[ -f "$BIN" ]] || die "not a regular binary file: $BIN"
  local actual
  actual=$(sha256 "$BIN")
  [[ "$actual" == "$EXPECTED_SHA" ]] || die "SHA-256 mismatch; expected $EXPECTED_SHA, got $actual"
  chmod 700 "$BIN"
  if [[ "$PLATFORM_OS" == Darwin ]]; then
    local version_output version_rc
    set +e
    version_output=$("$BIN" --version 2>&1)
    version_rc=$?
    set -u
    if [[ "$version_rc" != 0 ]]; then
      if [[ "$version_output" =~ [Qq]uarantine|[Dd]eveloper|[Vv]erif|cannot[[:space:]]be[[:space:]]opened ]]; then
        printf 'pilot: macOS Gatekeeper blocked Herdr; quarantine remediation is opt-in\n' >&2
        if [[ "${HERDR_MACOS_REMOVE_QUARANTINE:-0}" == 1 ]]; then
          command -v xattr >/dev/null 2>&1 || die 'xattr is required for opt-in Gatekeeper remediation'
          xattr -d com.apple.quarantine "$BIN" || die 'could not remove Herdr quarantine attribute'
          "$BIN" --version >/dev/null 2>&1 || die 'Herdr still cannot execute after quarantine remediation'
        else
          die 'Herdr execution blocked by macOS Gatekeeper; set HERDR_MACOS_REMOVE_QUARANTINE=1 to remove only com.apple.quarantine'
        fi
      else
        die "Herdr executable check failed: $version_output"
      fi
    fi
  fi
}

herdr() {
  env HOME="$HOME_DIR" XDG_CONFIG_HOME="$XDG_DIR" HERDR_CONFIG_PATH="$CONFIG" \
    "$BIN" --session "$SESSION" "$@"
}

quote_cmd() {
  local x out=
  for x in "$@"; do printf -v x '%q' "$x"; out+="$x "; done
  printf '%s' "${out% }"
}

record() {
  local label=$1; shift
  local started ended rc output command
  command=$(quote_cmd "$@")
  started=$(now_ms)
  set +e
  output=$("$@" 2>&1)
  rc=$?
  ended=$(now_ms)
  printf '\n### %s\n\n**Command:** `%s`\n**Duration:** %sms  **Exit:** %s\n\n```text\n%s\n```\n' \
    "$label" "$command" "$((ended-started))" "$rc" "$output" >> "$EVIDENCE"
  printf '%s\n' "$output"
  return "$rc"
}

record_herdr() {
  local label=$1; shift
  record "$label" env HOME="$HOME_DIR" XDG_CONFIG_HOME="$XDG_DIR" HERDR_CONFIG_PATH="$CONFIG" \
    "$BIN" --session "$SESSION" "$@"
}

ensure_dirs() {
  mkdir -p "$HOME_DIR/.pi/agent/extensions" "$HOME_DIR/.config/opencode/plugins" "$XDG_DIR" "$STATE"
  if [[ ! -f "$CONFIG" ]]; then
    cat > "$CONFIG" <<'EOF'
# Temporary human-pilot config; generated only inside this directory.
[keys]
prefix = "ctrl+a"
focus_pane_left = "alt+h"
focus_pane_down = "alt+j"
focus_pane_up = "alt+k"
focus_pane_right = "alt+l"
new_workspace = "alt+n"
workspace_picker = "alt+w"

[ui]
mouse_capture = true
copy_on_select = true

[experimental]
allow_nested = false
EOF
  fi
}

server_running() {
  local status
  status=$(herdr status server --json 2>/dev/null) || return 1
  printf '%s' "$status" | python3 -c \
    'import json,sys; raise SystemExit(0 if json.load(sys.stdin).get("running") is True else 1)' 2>/dev/null
}

start_server() {
  server_running && return 0
  printf 'pilot: starting isolated Herdr server (%s)\n' "$SESSION"
  nohup env HOME="$HOME_DIR" XDG_CONFIG_HOME="$XDG_DIR" HERDR_CONFIG_PATH="$CONFIG" \
    "$BIN" --session "$SESSION" server > "$STATE/server.log" 2>&1 &
  printf '%s\n' "$!" > "$STATE/server.pid"
  sleep 1
  server_running || die "Herdr server did not start; see $STATE/server.log"
}

install_temp_integrations() {
  if [[ ! -f "$HOME_DIR/.pi/agent/extensions/herdr-agent-state.ts" ]]; then
    record_herdr 'setup: install temporary Pi integration' integration install pi || die 'Pi integration install failed'
  fi
  if [[ ! -f "$HOME_DIR/.config/opencode/plugins/herdr-agent-state.js" ]]; then
    record_herdr 'setup: install temporary OpenCode integration' integration install opencode || die 'OpenCode integration install failed'
  fi
}

load_ids() {
  [[ -f "$IDS" ]] || return 1
  # ids.env is generated here; reject anything outside the expected opaque-id form.
  # shellcheck disable=SC1090
  source "$IDS"
  safe_id "${WORKSPACE_ID:-}" && safe_id "${TAB_ID:-}" && \
    safe_id "${PI_PANE_ID:-}" && safe_id "${CODE_PANE_ID:-}"
}

write_ids() {
  local workspace=$1 tab=$2 pi_pane=$3 code_pane=$4
  local x
  for x in "$workspace" "$tab" "$pi_pane" "$code_pane"; do safe_id "$x" || die "unexpected Herdr id: $x"; done
  cat > "$IDS" <<EOF
WORKSPACE_ID=$workspace
TAB_ID=$tab
PI_PANE_ID=$pi_pane
CODE_PANE_ID=$code_pane
EOF
}

create_layout() {
  local workspace_json tab_json split_json workspace tab pi_pane code_pane
  workspace_json=$(herdr workspace create --cwd "$ROOT" --label human-pilot-space --focus \
    --env HOME=/root --env PI_CODING_AGENT_DIR="$PI_AGENT_DIR" \
    --env OPENCODE_CONFIG_DIR="$PROFILE" --env OPENCODE_ENABLE_EXA=1 \
    --env OPENCODE_CONFIG= --env OPENCODE_CONFIG_CONTENT= --env OPENCODE_TUI_CONFIG= \
    --env OPENCODE_DISABLE_PROJECT_CONFIG=) || die 'workspace creation failed'
  workspace=$(printf '%s' "$workspace_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["workspace"]["workspace_id"])') || die 'workspace id missing'
  tab=$(printf '%s' "$workspace_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["tab"]["tab_id"])') || die 'tab id missing'
  pi_pane=$(printf '%s' "$workspace_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])') || die 'Pi pane id missing'
  tab_json=$(herdr tab create --workspace "$workspace" --cwd "$ROOT" --label agents --focus \
    --env HOME=/root --env PI_CODING_AGENT_DIR="$PI_AGENT_DIR" \
    --env OPENCODE_CONFIG_DIR="$PROFILE" --env OPENCODE_ENABLE_EXA=1 \
    --env OPENCODE_CONFIG= --env OPENCODE_CONFIG_CONTENT= --env OPENCODE_TUI_CONFIG= \
    --env OPENCODE_DISABLE_PROJECT_CONFIG=) || die 'tab creation failed'
  tab=$(printf '%s' "$tab_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["tab"]["tab_id"])') || die 'agent tab id missing'
  pi_pane=$(printf '%s' "$tab_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])') || die 'agent pane id missing'
  split_json=$(herdr pane split --pane "$pi_pane" --direction right --ratio 0.5 --no-focus) || die 'pane split failed'
  code_pane=$(printf '%s' "$split_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])') || die 'OpenCode pane id missing'
  write_ids "$workspace" "$tab" "$pi_pane" "$code_pane"
}

agent_present() {
  local name=$1
  herdr agent list 2>/dev/null | python3 -c \
    'import json,sys; n=sys.argv[1]; d=json.load(sys.stdin); print("yes" if any(a.get("name")==n for a in d.get("result",{}).get("agents",[])) else "no")' \
    "$name" 2>/dev/null | grep -qx yes
}

start_agents() {
  load_ids || die 'layout ids unavailable'
  if ! agent_present human-pi; then
    record_herdr 'setup: start named Pi agent' agent start human-pi --kind pi --pane "$PI_PANE_ID" --timeout 60000 -- \
      --extension "$HOME_DIR/.pi/agent/extensions/herdr-agent-state.ts" --no-session --no-tools || \
      printf 'pilot: Pi agent start failed; panes remain available\n' >&2
  fi
  if ! agent_present human-opencode; then
    record_herdr 'setup: unset conflicting OpenCode variables' pane run "$CODE_PANE_ID" \
      'unset OPENCODE_CONFIG OPENCODE_CONFIG_CONTENT OPENCODE_TUI_CONFIG OPENCODE_DISABLE_PROJECT_CONFIG; export OPENCODE_CONFIG_DIR=/pi_agent/agent_profiles/code/opencode OPENCODE_ENABLE_EXA=1' || true
    record_herdr 'setup: start named OpenCode agent' agent start human-opencode --kind opencode --pane "$CODE_PANE_ID" --timeout 60000 || \
      printf 'pilot: OpenCode agent start failed; panes remain available\n' >&2
  fi
}

setup() {
  local no_agents=0 arg
  for arg in "$@"; do
    [[ "$arg" == --no-agents ]] && no_agents=1 || die "unknown setup option: $arg"
  done
  verify_binary
  ensure_dirs
  install_temp_integrations
  start_server
  if ! load_ids || ! herdr workspace get "$WORKSPACE_ID" >/dev/null 2>&1; then
    create_layout
  fi
  [[ "$no_agents" == 1 ]] || start_agents
  printf 'pilot: setup complete; run ./pilot.sh attach or ./pilot.sh status\n'
}

status_cmd() {
  verify_binary
  ensure_dirs
  {
    printf '# human Herdr pilot status (%s)\n' "$(date -Is)"
    printf 'scope=%s session=%s binary_sha256=%s\n' "$ROOT" "$SESSION" "$(sha256 "$BIN")"
    record_herdr 'status: server' status server --json || true
    record_herdr 'status: workspaces' workspace list || true
    if load_ids; then
      record_herdr 'status: tabs' tab list --workspace "$WORKSPACE_ID" || true
      record_herdr 'status: panes' pane list --workspace "$WORKSPACE_ID" || true
    fi
    record_herdr 'status: agents' agent list || true
  } | tee "$STATE/status-$(date +%s).txt"
}

attach() {
  verify_binary
  ensure_dirs
  exec env HOME="$HOME_DIR" XDG_CONFIG_HOME="$XDG_DIR" HERDR_CONFIG_PATH="$CONFIG" \
    "$BIN" --session "$SESSION"
}

cleanup() {
  if [[ -d "$XDG_DIR" ]]; then
    if server_running && load_ids; then
      herdr workspace close "$WORKSPACE_ID" >/dev/null 2>&1 || true
    fi
    herdr server stop >/dev/null 2>&1 || true
    herdr session delete "$SESSION" >/dev/null 2>&1 || true
  fi
  rm -rf "$HOME_DIR" "$XDG_DIR" "$CONFIG" "$STATE"
  rm -f "$ROOT/herdr-linux-x86_64" "$ROOT/herdr-linux-aarch64" \
    "$ROOT/herdr-macos-aarch64" "$ROOT/herdr-macos-x86_64"
  printf 'pilot: cleaned own Herdr session/process/state; preserved pilot.sh, CHECKLIST.md, and evidence files\n'
}

case "${1:-}" in
  setup) shift; setup "$@" ;;
  attach) shift; [[ $# == 0 ]] || die 'attach takes no options'; attach ;;
  status) shift; [[ $# == 0 ]] || die 'status takes no options'; status_cmd ;;
  cleanup) shift; [[ $# == 0 ]] || die 'cleanup takes no options'; cleanup ;;
  *)
    printf 'Usage: %s {setup [--no-agents]|attach|status|cleanup}\n' "$0" >&2
    exit 2
    ;;
esac
