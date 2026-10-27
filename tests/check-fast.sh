#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(cd -- "$script_dir/.." && pwd -P)
cd "$repo_root"

shell_sources=(
  docker-entrypoint.sh
  agent_profiles/code/code
  agent_profiles/openbrain/openbrain
  agent_profiles/pibrain/pibrain
  agent_profiles/pimatt/pimatt
  tests/check-fast.sh
  tests/code-profile-smoke.sh
  tests/code-mini-tmux-smoke.sh
  tests/openbrain-profile-smoke.sh
  tests/compose-smoke.sh
)

for source in "${shell_sources[@]}"; do
  printf '==> bash -n %s\n' "$source"
  bash -n "$source"
done

printf '==> bash tests/code-profile-smoke.sh\n'
bash tests/code-profile-smoke.sh
printf '==> bash tests/openbrain-profile-smoke.sh\n'
bash tests/openbrain-profile-smoke.sh
printf '==> python3 tests/graphify-skill-smoke.py\n'
python3 tests/graphify-skill-smoke.py
printf '==> python3 tests/no-voice-integration-smoke.py\n'
python3 tests/no-voice-integration-smoke.py
