#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
python3 - "$repo_root" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import quote

root = Path(sys.argv[1])
profile = root / "agent_profiles/ecc"
config_dir = profile / "opencode"
dockerignore = (root / ".dockerignore").read_text().splitlines()
assert "!agent_profiles/ecc/" in dockerignore
assert "!agent_profiles/ecc/ecc" in dockerignore
assert "COPY agent_profiles/ecc/ecc /usr/local/bin/ecc" in (root / "Dockerfile").read_text()
config = json.loads((config_dir / "opencode.json").read_text())
assert config["plugin"] == ["./ecc-plugin.ts"]
package = json.loads((config_dir / "package.json").read_text())
assert package["dependencies"] == {"ecc-universal": "2.2.3", "@opencode-ai/plugin": "1.19.0"}
assert "package.json" not in (config_dir / ".gitignore").read_text().splitlines()
assert len(config["agent"]) == 26
assert len(config["command"]) == 26
assert config["default_agent"] == "build"
assert "model" not in config and "provider" not in config
assert all("model" not in agent for agent in config["agent"].values())
assert config["permission"]["bash"] == "ask"
assert config["permission"]["external_directory"] == "ask"
readonly_agents = {"planner", "architect", "code-reviewer", "go-reviewer",
                   "cpp-reviewer", "docs-lookup", "java-reviewer", "kotlin-reviewer",
                   "php-reviewer", "python-reviewer", "rust-reviewer"}
for name, agent in config["agent"].items():
    assert "tools" not in agent, name
    permission = agent["permission"]
    assert permission == ({"edit": "deny"} if name in readonly_agents else {}), name
    assert permission.get("bash", config["permission"]["bash"]) == "ask", name
assert not (config_dir / "plugins").exists()
assert not (config_dir / "AGENTS.md").exists()

for reference in re.findall(r"\{file:([^}]+)\}", json.dumps(config)):
    path = (config_dir / reference).resolve()
    assert path.is_relative_to(config_dir.resolve()) and path.is_file(), reference
for reference in config["instructions"] + config["skills"]["paths"]:
    path = Path(reference)
    assert path.is_absolute()
    relative = path.relative_to("/pi_agent/agent_profiles/ecc/opencode")
    assert (config_dir / relative).exists(), reference
for command in config["command"].values():
    assert command.get("agent", "build") in config["agent"]

manifest = json.loads((profile / "upstream-manifest.json").read_text())
assert manifest["commit"] == "c05b2d6614f62f6db0047669aa4eefb223d478f9"
assert manifest["version"] == "2.2.3"
for name, entry in manifest["files"].items():
    assert hashlib.sha256((profile / name).read_bytes()).hexdigest() == entry["sha256"], name
assert len(list((config_dir / "skills").glob("*/SKILL.md"))) == 293
assert len(list((config_dir / "commands").glob("*.md"))) == 35
for reference in ("scripts/setup-package-manager.js", "scripts/harness-audit.js",
                  "skills/continuous-learning-v2/scripts/instinct-cli.py"):
    assert (config_dir / reference).is_file()

# Execute the unmodified adapter body with a deterministic upstream fixture.
fixture = '''export default async (input) => {
  if (input.marker !== "forwarded") throw Error("input not forwarded");
  return {"permission.ask": () => ({approved: true}),
          "session.created": () => "retained", tool: {"changed-files": {}, "dependency-analyzer": {}}};
};'''
fixture_url = "data:text/javascript," + quote(fixture, safe="")
adapter = (config_dir / "ecc-plugin.ts").read_text().replace('"ecc-universal"', json.dumps(fixture_url))
adapter_url = "data:text/javascript," + quote(adapter, safe="")
check = '''const {default: plugin} = await import(process.argv[1]);
const hooks = await plugin({marker: "forwarded"});
if ("permission.ask" in hooks || hooks["session.created"]() !== "retained" ||
    Object.keys(hooks.tool).sort().join(",") !== "changed-files,dependency-analyzer") process.exit(1);
'''
subprocess.run(["node", "--input-type=module", "-e", check, adapter_url], check=True)

# Substitute only the installation root; never create state in the real profile.
with tempfile.TemporaryDirectory(prefix="ecc-smoke-") as temporary:
    tmp = Path(temporary)
    isolated = tmp / "profile"
    (isolated / "opencode").mkdir(parents=True)
    launcher = tmp / "ecc"
    launcher.write_text((profile / "ecc").read_text().replace(
        "profile=/pi_agent/agent_profiles/ecc", f'profile="{isolated}"'))
    binary = tmp / "bin/opencode"
    binary.parent.mkdir()
    binary.write_text(f"#!{sys.executable}\nimport json,os,sys\nprint(json.dumps(dict(env=dict(os.environ),args=sys.argv[1:],cwd=os.getcwd())))\n")
    binary.chmod(0o755)
    host = tmp / "host"
    host.mkdir()
    (host / "sentinel").write_text("unchanged")
    env = dict(os.environ, PATH=f"{binary.parent}:{os.environ['PATH']}",
               HOME=str(host), XDG_CONFIG_HOME=str(host), XDG_DATA_HOME=str(host),
               XDG_STATE_HOME=str(host), XDG_CACHE_HOME=str(host), OPENCODE_DB=str(host),
               npm_config_cache=str(host), BUN_INSTALL_CACHE_DIR=str(host),
               OPENCODE_CONFIG="host.json", OPENCODE_CONFIG_CONTENT="{}",
               OPENCODE_DISABLE_PROJECT_CONFIG="true", OPENCODE_TUI_CONFIG="host-tui.json",
               ECC_SMOKE_CREDENTIAL="inherited")
    args = ["--agent", "planner", "a spaced argument", "", "--", "literal;$value"]
    result = subprocess.run(["bash", str(launcher), *args], cwd=host, env=env,
                            check=True, text=True, capture_output=True)
    output = json.loads(result.stdout)
    assert output["args"] == args
    assert output["cwd"] == str(host)
    actual = output["env"]
    runtime = isolated / "runtime"
    paths = {"HOME": "home", "XDG_CONFIG_HOME": "config", "XDG_DATA_HOME": "data",
             "XDG_STATE_HOME": "state", "XDG_CACHE_HOME": "cache",
             "OPENCODE_DB": "state/opencode.db", "npm_config_cache": "cache/npm",
             "BUN_INSTALL_CACHE_DIR": "cache/bun"}
    for key, suffix in paths.items():
        assert actual[key] == str(runtime / suffix), key
    assert actual["OPENCODE_CONFIG_DIR"] == str(isolated / "opencode")
    assert actual["OPENCODE_TUI_CONFIG"] == str(isolated / "opencode/tui.jsonc")
    for key in ("OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_DISABLE_PROJECT_CONFIG"):
        assert key not in actual
    assert actual["ECC_SMOKE_CREDENTIAL"] == "inherited"
    assert list(host.iterdir()) == [host / "sentinel"]
    assert (host / "sentinel").read_text() == "unchanged"
    assert sorted(p.name for p in runtime.iterdir()) == ["cache", "config", "data", "home", "state"]
print("ECC profile smoke passed: catalog, hashes, references, launcher isolation")
PY
