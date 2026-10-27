#!/usr/bin/env bash
set -euo pipefail

python3 - "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" <<'PY'
import hashlib
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
omo_config = (root / "agent_profiles/code/opencode/oh-my-opencode-slim.jsonc").read_text()
dockerfile = (root / "Dockerfile").read_text()
omo_version = "3.0.6"
assert re.search(
    rf'"plugin"\s*:\s*\[\s*"oh-my-opencode-slim@{re.escape(omo_version)}"\s*\]',
    server_config,
), "server plugin list must contain only pinned OMO"
assert f"oh-my-opencode-slim@{omo_version}" in tui_config, "TUI OMO version must match server plugin"
assert f"oh-my-opencode-slim@{omo_version}/oh-my-opencode-slim.schema.json" in omo_config, "OMO schema version must match plugin"
assert f"npm install --global oh-my-opencode-slim@{omo_version}" in dockerfile, "Docker OMO version must match profile"
assert "ponytail" not in (server_config + tui_config + launcher_source).lower(), "Ponytail wiring must be removed"

skill_dir = root / "agent_profiles/code/opencode/skills/karpathy-guidelines"
skill = (skill_dir / "SKILL.md").read_text()
assert skill.startswith("---\nname: karpathy-guidelines\n"), "skill must have named frontmatter"
frontmatter = skill.split("---", 2)[1]
assert "\ndescription: " in frontmatter and "\nlicense: MIT\n" in frontmatter, "skill metadata missing"
digest = hashlib.sha256()
for path in sorted(path for path in skill_dir.rglob("*") if path.is_file()):
    digest.update(path.relative_to(skill_dir).as_posix().encode())
    digest.update(path.read_bytes())
lock = json.loads((root / "agent_profiles/code/skills-lock.json").read_text())["skills"]["karpathy-guidelines"]
assert lock == {
    "source": "multica-ai/andrej-karpathy-skills",
    "sourceType": "github",
    "skillPath": "skills/karpathy-guidelines/SKILL.md",
    "ref": "2c606141936f1eeef17fa3043a72095b4765b9c2",
    "computedHash": digest.hexdigest(),
}, "skill folder hash and pinned provenance must match lock"
instructions = (root / "agent_profiles/code/opencode/AGENTS.md").read_text()
assert "skills/karpathy-guidelines/SKILL.md" in instructions, "profile instructions must point to mandatory Karpathy skill"

with tempfile.TemporaryDirectory(prefix="code-profile-smoke-") as temp:
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
        "keys = ('OPENCODE_PORT', 'OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT', 'OPENCODE_TUI_CONFIG', 'OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS', 'OPENCODE_ENABLE_EXA')\n"
        "with open(os.environ['CODE_PROFILE_SMOKE_CAPTURE'], 'w') as output:\n"
        "    json.dump({'argv': sys.argv[1:], 'env': {key: os.environ[key] for key in keys if key in os.environ}}, output)\n"
    )
    stub.chmod(0o755)

    def invoke(name, args):
        env = dict(os.environ)
        for key in (
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
                "CODE_PROFILE_SMOKE_CAPTURE": str(temp / f"{name}.json"),
                "OPENCODE_CONFIG_CONTENT": "stale-content",
                "OPENCODE_TUI_CONFIG": "stale-tui-config",
                "OPENCODE_DISABLE_PROJECT_CONFIG": "stale-disable-setting",
            }
        )
        subprocess.run([str(launcher), *args], env=env, check=True)
        result = json.loads((temp / f"{name}.json").read_text())
        captured_env = result["env"]
        assert captured_env["OPENCODE_CONFIG_DIR"] == str(root / "agent_profiles/code/opencode"), name
        assert captured_env["OPENCODE_CONFIG"] == str(root / "agent_profiles/code/opencode/mcp-defaults.jsonc"), name
        assert captured_env["OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"] == "true", name
        assert captured_env["OPENCODE_ENABLE_EXA"] == "1", name
        for key in ("OPENCODE_CONFIG_CONTENT", "OPENCODE_TUI_CONFIG", "OPENCODE_DISABLE_PROJECT_CONFIG"):
            assert key not in captured_env, f"{name}: {key} should remain unset"
        return result

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

print("PASS: code profile config, Karpathy skill provenance, subcommands, ports, and core environment")
PY
