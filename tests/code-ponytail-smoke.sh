#!/usr/bin/env bash
set -euo pipefail

python3 - "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" <<'PY'
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
source_launcher = root / "agent_profiles/code/code"
launcher_source = source_launcher.read_text()
deployment_path = "profile=/pi_agent/agent_profiles/code"
assert launcher_source.count(deployment_path) == 1, "expected one deployment profile path in launcher"
server_config = (root / "agent_profiles/code/opencode/opencode.jsonc").read_text()
tui_config = (root / "agent_profiles/code/opencode/tui.jsonc").read_text()
assert re.search(
    r'"plugin"\s*:\s*\[\s*"oh-my-opencode-slim@3\.0\.2"\s*,\s*"@dietrichgebert/ponytail@5\.2\.0"\s*\]',
    server_config,
), "server plugin list must retain OMO and pin Ponytail"
assert "ponytail" not in tui_config.lower(), "Ponytail must not be a TUI plugin"

with tempfile.TemporaryDirectory(prefix="code-ponytail-smoke-") as temp:
    temp = Path(temp)
    launcher = temp / "code"
    fixture_source = launcher_source.replace(
        deployment_path,
        f"profile={shlex.quote(str(root / 'agent_profiles/code'))}",
    )
    launcher.write_text(fixture_source)
    launcher.chmod(0o755)
    stub_dir = temp / "bin"
    stub_dir.mkdir()
    stub = stub_dir / "opencode"
    stub.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "keys = ('PONYTAIL_DEFAULT_MODE', 'OPENCODE_PORT', 'OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_TUI_CONFIG', 'OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS', 'OPENCODE_ENABLE_EXA')\n"
        "with open(os.environ['PONYTAIL_SMOKE_CAPTURE'], 'w') as output:\n"
        "    json.dump({'argv': sys.argv[1:], 'env': {key: os.environ[key] for key in keys if key in os.environ}}, output)\n"
    )
    stub.chmod(0o755)

    def invoke(name, args, mode="unset"):
        env = dict(os.environ)
        for key in (
            "PONYTAIL_DEFAULT_MODE",
            "OPENCODE_PORT",
            "OPENCODE_CONFIG_DIR",
            "OPENCODE_CONFIG",
            "OPENCODE_CONFIG_CONTENT",
            "OPENCODE_TUI_CONFIG",
            "OPENCODE_DISABLE_PROJECT_CONFIG",
            "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS",
            "OPENCODE_ENABLE_EXA",
        ):
            env.pop(key, None)
        env.update(
            {
                "PATH": f"{stub_dir}{os.pathsep}{env['PATH']}",
                "PONYTAIL_SMOKE_CAPTURE": str(temp / f"{name}.json"),
                "OPENCODE_CONFIG_CONTENT": "stale-content",
                "OPENCODE_TUI_CONFIG": "stale-tui-config",
                "OPENCODE_DISABLE_PROJECT_CONFIG": "stale-disable-setting",
            }
        )
        if mode != "unset":
            env["PONYTAIL_DEFAULT_MODE"] = mode
        subprocess.run([str(launcher), *args], env=env, check=True)
        result = json.loads((temp / f"{name}.json").read_text())
        captured_env = result["env"]
        assert captured_env["PONYTAIL_DEFAULT_MODE"] == ("lite" if mode in ("unset", "") else mode), name
        assert captured_env["OPENCODE_CONFIG_DIR"] == str(root / "agent_profiles/code/opencode"), name
        assert captured_env["OPENCODE_CONFIG"] == str(root / "agent_profiles/code/opencode/mcp-defaults.jsonc"), name
        assert captured_env["OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"] == "true", name
        assert captured_env["OPENCODE_ENABLE_EXA"] == "1", name
        for key in ("OPENCODE_CONFIG_CONTENT", "OPENCODE_TUI_CONFIG", "OPENCODE_DISABLE_PROJECT_CONFIG"):
            assert key not in captured_env, f"{name}: {key} should remain unset"
        return result

    for name, value, expected in (
        ("mode-absent", "unset", "lite"),
        ("mode-empty", "", "lite"),
        ("mode-full", "full", "full"),
        ("mode-ultra", "ultra", "ultra"),
        ("mode-off", "off", "off"),
    ):
        result = invoke(name, ["run", "task"], mode=value)
        assert result["env"]["PONYTAIL_DEFAULT_MODE"] == expected, name
        assert result["argv"] == ["run", "task"], name
        assert "OPENCODE_PORT" not in result["env"], name

    for name, args in (("run-no-port", ["run", "task"]), ("serve-no-port", ["serve", "--host", "127.0.0.1"])):
        result = invoke(name, args)
        assert result["argv"] == args, name
        assert "OPENCODE_PORT" not in result["env"], name

    automatic = invoke("tui-auto-port", ["--profile-test"])
    auto_argv = automatic["argv"]
    assert auto_argv[:1] == ["--port"] and auto_argv[2:] == ["--profile-test"], auto_argv
    auto_port = auto_argv[1]
    assert auto_port.isdigit() and 49152 <= int(auto_port) <= 65535, auto_port
    assert automatic["env"]["OPENCODE_PORT"] == auto_port

    for name, args, expected_port in (
        ("tui-explicit-port", ["--port", "43123", "--profile-test"], "43123"),
        ("tui-equals-port", ["--profile-test", "--port=43124"], "43124"),
    ):
        result = invoke(name, args)
        assert result["argv"] == args, name
        assert result["env"]["OPENCODE_PORT"] == expected_port, name

print("PASS: Ponytail config, mode defaults, subcommands, ports, and core environment")
PY
