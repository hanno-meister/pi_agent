#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(cd -- "$script_dir/.." && pwd -P)
profile="$repo_root/agent_profiles/openbrain"
config_dir="$profile/opencode"
source_launcher="$profile/openbrain"
expected_plugin='"oh-my-opencode-slim@2.2.21"'

for config in "$config_dir/opencode.jsonc" "$config_dir/tui.jsonc"; do
  plugin_count=$(grep -Ec '"oh-my-opencode-slim@[^\"]+"' "$config" || true)
  if [[ "$plugin_count" -ne 1 ]] || ! grep -Fqx "    $expected_plugin" "$config"; then
    printf 'FAIL: expected exactly one pinned %s declaration in %s\n' \
      "$expected_plugin" "$config" >&2
    exit 1
  fi
  if grep -Eq '"[^\"]*/node_modules/[^\"]*"' "$config"; then
    printf 'FAIL: absolute node_modules dependency in %s\n' "$config" >&2
    exit 1
  fi
done

tmp=$(mktemp -d "${TMPDIR:-/tmp}/openbrain-profile-smoke.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

# Exercise a copy with the deployment-only path redirected to this checkout.
# This keeps the fixture portable when the repository is not at /pi_agent.
python3 - "$source_launcher" "$tmp/openbrain" "$profile" <<'PY'
from pathlib import Path
import shlex
import sys

source_path, fixture_path, profile = map(Path, sys.argv[1:])
source = source_path.read_text()
deployment_path = "profile=/pi_agent/agent_profiles/openbrain"
assert source.count(deployment_path) == 1, "expected one deployment profile path in launcher"
target_assignment = f"profile={shlex.quote(str(profile))}"
fixture_source = source.replace(deployment_path, target_assignment, 1)
assert fixture_source.count(target_assignment) == 1, "fixture profile assignment was not installed"
Path(fixture_path).write_text(fixture_source)
Path(fixture_path).chmod(0o755)
PY

# Prevent the real launcher from creating profile runtime directories while
# still exercising its environment and exec path.
cat > "$tmp/bin/mkdir" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$tmp/bin/opencode" <<'STUB'
#!/usr/bin/env bash
{
  printf 'HOME=%s\n' "$HOME"
  printf 'XDG_CONFIG_HOME=%s\n' "$XDG_CONFIG_HOME"
  printf 'XDG_DATA_HOME=%s\n' "$XDG_DATA_HOME"
  printf 'XDG_STATE_HOME=%s\n' "$XDG_STATE_HOME"
  printf 'XDG_CACHE_HOME=%s\n' "$XDG_CACHE_HOME"
  printf 'OPENCODE_DB=%s\n' "$OPENCODE_DB"
  printf 'npm_config_cache=%s\n' "$npm_config_cache"
  printf 'BUN_INSTALL_CACHE_DIR=%s\n' "$BUN_INSTALL_CACHE_DIR"
  printf 'OPENCODE_CONFIG_DIR=%s\n' "$OPENCODE_CONFIG_DIR"
  printf 'OPENCODE_TUI_CONFIG=%s\n' "$OPENCODE_TUI_CONFIG"
  printf 'OPENCODE_CONFIG_SET=%s\n' "${OPENCODE_CONFIG+x}"
  printf 'OPENCODE_CONFIG_CONTENT_SET=%s\n' "${OPENCODE_CONFIG_CONTENT+x}"
  printf 'OPENCODE_DISABLE_PROJECT_CONFIG_SET=%s\n' "${OPENCODE_DISABLE_PROJECT_CONFIG+x}"
} > "$OPENBRAIN_SMOKE_ENV"
printf '%s\0' "$@" > "$OPENBRAIN_SMOKE_ARGS"
STUB
chmod +x "$tmp/bin/mkdir" "$tmp/bin/opencode"

env \
  PATH="$tmp/bin:$PATH" \
  OPENBRAIN_SMOKE_ENV="$tmp/env" \
  OPENBRAIN_SMOKE_ARGS="$tmp/args" \
  OPENCODE_CONFIG=host-config \
  OPENCODE_CONFIG_CONTENT=host-config-content \
  OPENCODE_DISABLE_PROJECT_CONFIG=1 \
  "$tmp/openbrain" --profile-test 'argument with spaces'

printf '%s\n' \
  "HOME=$profile/runtime/home" \
  "XDG_CONFIG_HOME=$profile/runtime/config" \
  "XDG_DATA_HOME=$profile/runtime/data" \
  "XDG_STATE_HOME=$profile/runtime/state" \
  "XDG_CACHE_HOME=$profile/runtime/cache" \
  "OPENCODE_DB=$profile/runtime/state/opencode.db" \
  "npm_config_cache=$profile/runtime/cache/npm" \
  "BUN_INSTALL_CACHE_DIR=$profile/runtime/cache/bun" \
  "OPENCODE_CONFIG_DIR=$config_dir" \
  "OPENCODE_TUI_CONFIG=$config_dir/tui.jsonc" \
  'OPENCODE_CONFIG_SET=' \
  'OPENCODE_CONFIG_CONTENT_SET=' \
  'OPENCODE_DISABLE_PROJECT_CONFIG_SET=' > "$tmp/expected-env"
if ! diff -u "$tmp/expected-env" "$tmp/env"; then
  printf '%s\n' 'FAIL: OpenBrain launcher environment differs from expected isolation' >&2
  exit 1
fi

mapfile -d '' -t actual_args < "$tmp/args"
expected_args=(--profile-test 'argument with spaces')
if [[ "${#actual_args[@]}" -ne "${#expected_args[@]}" ]]; then
  printf '%s\n' 'FAIL: OpenBrain launcher changed the argument count' >&2
  exit 1
fi
for index in "${!expected_args[@]}"; do
  if [[ "${actual_args[$index]}" != "${expected_args[$index]}" ]]; then
    printf '%s\n' 'FAIL: OpenBrain launcher changed argument contents' >&2
    exit 1
  fi
done

printf 'PASS: pinned plugin declarations and isolated launcher behavior (%s)\n' "$profile"
