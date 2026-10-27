# ECC profile paths

The native ECC catalog is installed at `/pi_agent/agent_profiles/ecc/opencode`, not in the current project or a Claude plugin installation. Keep the current project as the working directory.

- Resolve catalog references to `skills/`, `commands/`, `prompts/`, and `instructions/` beneath that absolute profile directory. In catalog command examples, replace `${CLAUDE_PLUGIN_ROOT}`, `$ECC_ROOT`, and `~/.claude/skills` lookups with this profile's root or `skills` directory as appropriate; do not search other plugin installations.
- Run `/setup-pm` verification with `node /pi_agent/agent_profiles/ecc/opencode/scripts/setup-package-manager.js --detect`.
- Run `/harness-audit` with `node /pi_agent/agent_profiles/ecc/opencode/scripts/harness-audit.js`, preserving the requested arguments and project working directory.
- Run instinct commands with `python3 /pi_agent/agent_profiles/ecc/opencode/skills/continuous-learning-v2/scripts/instinct-cli.py` and the requested subcommand/arguments.
- Historical Claude integration examples are reference material, not a request to install Claude hooks, run ECC installers, or change global configuration. Profile-owned home/state stays beneath `/pi_agent/agent_profiles/ecc/runtime`; project changes still require normal approval.
