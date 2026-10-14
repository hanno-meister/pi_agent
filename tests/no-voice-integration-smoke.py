#!/usr/bin/env python3
"""Offline checks that voice integration is removed without losing profiles."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VOICE_MODULE = ROOT / "voice-input"
COMPOSE = ROOT / "compose.yaml"
ENV_EXAMPLE = ROOT / ".env.example"

assert not VOICE_MODULE.exists(), "voice-input module must be removed"

compose = COMPOSE.read_text()
assert "voice-gateway" not in compose, "Compose must not define or depend on voice-gateway"
assert "VOICE_" not in compose, "Compose must not retain voice-specific environment settings"
assert "depends_on:" not in compose, "the single pi service must not depend on removed services"
assert re.search(r"env_file:\s*\n\s+- path: \.env\s*\n\s+required: false", compose)

persistent_volumes = (
    "pi-agent",
    "opencode-data",
    "opencode-cache",
    "opencode-state",
    "ssh-data",
    "nvim-data",
    "nvim-cache",
    "nvim-state",
    "tmux-plugins",
)
for volume in persistent_volumes:
    assert re.search(rf"^\s+- {re.escape(volume)}:/", compose, re.MULTILINE), volume

env_example = ENV_EXAMPLE.read_text()
assert "VOICE_" not in env_example
for credential in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "TAVILY_API_KEY", "LANGSMITH_API_KEY"):
    assert f"{credential}=" in env_example, credential

compose_smoke = (ROOT / "tests/compose-smoke.sh").read_text()
assert '["pimatt", [], ["voice", "voice-setup"]]' in compose_smoke
assert '["pibrain", ["mcp", "mcp-auth"], ["voice", "voice-setup"]]' in compose_smoke
assert "voice-gateway" not in compose_smoke

entrypoint = (ROOT / "docker-entrypoint.sh").read_text()
legacy_extensions = (
    "/root/.pi/agent/extensions/voice-input.js",
    "/root/.pi/agent/extensions/voice-input-loader.js",
)
for legacy_extension in legacy_extensions:
    assert legacy_extension in entrypoint, f"preserve one-time cleanup for {legacy_extension}"
    assert f"test ! -e {legacy_extension}" in compose_smoke
    assert f"test ! -L {legacy_extension}" in compose_smoke
assert "rm -rf /root/.pi/agent" not in entrypoint, "do not wipe the persistent agent volume"

readme = (ROOT / "README.md").read_text().lower()
for removed_documentation in ("voice-gateway", "voice dictation", "voice-input", "voice-setup", "voice troubleshooting"):
    assert removed_documentation not in readme, removed_documentation
release_notes = (ROOT / "docs/releases/0.2.0.md").read_text()
assert "--remove-orphans" in release_notes
assert re.search(r"do not add `--volumes`", release_notes, re.IGNORECASE)

launcher_paths = {
    "pimatt": ROOT / "agent_profiles/pimatt/pimatt",
    "pibrain": ROOT / "agent_profiles/pibrain/pibrain",
}
for launcher in launcher_paths.values():
    launcher_text = launcher.read_text()
    assert "/voice-input/" not in launcher_text
    assert "voice-setup" not in launcher_text

with tempfile.TemporaryDirectory(prefix="no voice integration smoke-") as temporary:
    temporary_path = Path(temporary)
    stub_directory = temporary_path / "bin"
    stub_directory.mkdir()
    capture = temporary_path / "pi-args.json"
    pi_stub = stub_directory / "pi"
    pi_stub.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "with open(os.environ['PI_SMOKE_CAPTURE'], 'w') as output:\n"
        "    json.dump(sys.argv[1:], output)\n"
    )
    pi_stub.chmod(0o755)

    environment = os.environ.copy()
    environment["PATH"] = f"{stub_directory}{os.pathsep}{environment['PATH']}"
    environment["PI_SMOKE_CAPTURE"] = str(capture)

    for profile, launcher in launcher_paths.items():
        arguments = ["--smoke-arg", "argument with spaces"]
        subprocess.run([str(launcher), *arguments], env=environment, check=True)
        forwarded = json.loads(capture.read_text())
        profile_path = f"/pi_agent/agent_profiles/{profile}"

        if profile == "pimatt":
            expected = [
                "--model",
                "openai-codex/gpt-5.6-sol",
                "--skill",
                f"{profile_path}/skills/.agents/skills",
                *arguments,
            ]
            assert "--extension" not in forwarded
        else:
            expected = [
                "--model",
                "openai-codex/gpt-5.6-luna",
                "--thinking",
                "high",
                "--extension",
                "/usr/local/lib/node_modules/pi-mcp-adapter/index.ts",
                "--mcp-config",
                f"{profile_path}/mcp.json",
                "--skill",
                f"{profile_path}/skills/.agents/skills",
                *arguments,
            ]
            assert "--mcp-config" in forwarded

        assert forwarded == expected, profile
        assert not any("voice" in argument.lower() for argument in forwarded), profile

print("PASS: voice module/settings/hooks removed; Pi MCP, credentials, volumes, and legacy cleanup preserved")
