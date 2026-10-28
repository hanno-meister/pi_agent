# Code profile

OpenCode profile with oh-my-opencode-slim, Graphify, locally developed workflows, and a tracked selection of attributed third-party skills. Additional skills are installed manually.

## Start

Inside the development container:

```sh
cd /pi_agent/workspaces/projects/<repository>
code
```

`code` is a global launcher for OpenCode. It scopes configuration to
`/pi_agent/agent_profiles/code/opencode` through `OPENCODE_CONFIG_DIR`, enables
OMO Slim background subagents and Exa search, then forwards all arguments to
`opencode`. Plain `opencode` is unchanged.

Only configuration is profile-scoped. OpenCode's runtime, authentication,
session, database, and cache state remain native/shared; this launcher does not
create per-pane directories or copy auth and preference files. OpenAI requests
explicitly use the Compose-injected `OPENAI_API_KEY`, so an older OpenCode
credential in `auth.json` cannot override `.env`.

Project `opencode.json` and `.opencode/` configuration load before the profile
directory. When settings conflict, profile configuration wins; project agents,
skills, and instructions remain available.

## MCP configuration

The profile-owned `opencode/mcp-defaults.jsonc` declares all five MCPs. Tavily
is enabled by default; DeepWiki and the LangChain docs, reference, and LangSmith
MCPs are disabled by default. Set `TAVILY_API_KEY` outside tracked files; do
not put the key in this profile or a repository configuration file.

Repositories can opt in to an MCP by overriding only its `enabled` property in
their `opencode.jsonc` or `.opencode/` configuration. For example:

```jsonc
{
  "mcp": {
    "deepwiki": {
      "enabled": true
    }
  }
}
```

Use the direct installed schema shape shown above: do not use `mcp.servers` or
`disabled`. Restart OpenCode after changing MCP configuration.

Interactive `code` launches choose a free high localhost port and pass matching
`--port`/`OPENCODE_PORT` values so OMO can attach agent panes. Set
`OPENCODE_PORT` or pass `--port` to override it. Non-interactive subcommands do
not open a server port.

## Karpathy guidelines

The profile uses the plain Markdown `karpathy-guidelines` skill for coding,
review, and refactoring. Profile `opencode/AGENTS.md` requires loading it for
coding tasks: surface assumptions, prefer simple solutions, make surgical
changes, and define verifiable success criteria. It needs no plugin, mode
switches, or persistent state. Restart OpenCode after changing profile
instructions or skills.

## Profile layout

```text
.agents/
└── skills -> ../opencode/skills  # project-scoped skills-cli adapter
opencode/
├── AGENTS.md
├── opencode.jsonc
├── tui.jsonc
├── oh-my-opencode-slim.jsonc
├── agents/                       # profile-owned OpenCode agents
├── commands/                     # profile-owned OpenCode commands
├── skills/                       # tracked, manual, Graphify, and runtime OMO skills
└── oh-my-opencode-slim/          # profile-owned OMO prompt overrides
```

OMO Slim itself is loaded as the pinned `oh-my-opencode-slim@3.0.6` npm plugin.
Its built-in agents remain package-owned. OMO-managed bundled skills are synced
into this profile's `skills/` directory; their runtime metadata and bundled
directories are ignored by Git. The repository also tracks selected Matt Pocock
skills plus locally developed commit and pull-request workflows.

## Graphify

[Graphify](https://github.com/Graphify-Labs/graphify) is installed from the
pinned `graphifyy` package in `Dockerfile`. Container startup generates its
OpenCode-specific skill in `opencode/skills/graphify/`; the directory is
runtime-managed and ignored by Git. Use `/graphify .` in `code`.

## Second-brain linking

Use `/skill:link-second-brain [@project]` to record one related second-brain
project in the current repository's root `AGENTS.md`. The user-invoked skill
lives in `opencode/skills/link-second-brain/` and is available only through the
`code` profile.

## LangChain expert agent

A profile-owned, read-only, on-demand subagent `langchain-expert` specializes in
LangChain, LangGraph, LangSmith, and Deep Agents. It is disabled by default in
`opencode/oh-my-opencode-slim.jsonc`. To opt in, remove it from
`disabled_agents`, and explicitly enable only the dedicated MCP servers needed
by setting their `enabled` properties in `opencode/mcp-defaults.jsonc`. Restart
OpenCode after changing either file. The agent investigates through repository
inspection and its dedicated MCPs; it is not an implementation writer. The
orchestrator routes ecosystem work to it, passes the repository root, files,
error text, and any LangSmith trace ids because subagents run in an isolated
context, and receives an implementation-ready, evidence-backed handoff for the
orchestrator or fixer.

It holds the 25 LangChain-ecosystem skills exclusively: every preset's
`orchestrator.skills` array lists each of them with a `"!name"` deny, so the
orchestrator never loads them. OpenCode filters an agent's advertised skills by
permission, so the denied skills cost the orchestrator no prompt tokens. Exact
names are used instead of a `langchain-*` glob because wildcard matching in
skill permission keys is unverified. The agent also gets `diagnosing-bugs`,
`verification-planning`, and `tdd`.

The agent's system prompt lives at
`opencode/oh-my-opencode-slim/langchain-expert.md`; OMO Slim loads
`oh-my-opencode-slim/<agent-name>.md` automatically, and the config's `prompt`
key is deliberately unset because an inline prompt would override the file.
Custom agents must be declared under the top-level `agents` key in
`oh-my-opencode-slim.jsonc`, since OMO reads custom agent names only from there;
its per-preset model lives in each `presets.<preset>.langchain-expert` block
(top-level `agents` wins over the preset layer, so `model` is omitted there).

Its local access is limited to `read`, `grep`, `glob`, `list`, and `lsp`; edit,
bash, task, and webfetch are denied. Generic or current-library research routes
to `@librarian`, broad repository navigation to `@explorer`, ordinary
implementation to the parent or `@fixer`, and UI work to `@designer`. Its
structured handoff is conditional: it reports findings without forcing a root
cause, and includes exact proposed changes only when warranted.

When opted in, it accesses `docs-langchain`, `reference-langchain`, and
`langsmith`. All three servers are disabled by default in the MCP configuration.
The EU `langsmith` MCP uses `LANGSMITH_API_KEY` in its `X-Api-Key` header with
`oauth: false`; it does not use an OAuth browser flow. Provide the key through
the environment, never tracked files.

## Curated ECC skills

Six unmodified skills from [affaan-m/ecc](https://github.com/affaan-m/ecc)
are pinned in the profile-root `skills-lock.json` to revision
`25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b`:

| Skill | Agent access |
| --- | --- |
| `agent-architecture-audit` | Oracle; optional `langchain-expert` (disabled by default) |
| `agent-harness-construction` | Oracle |
| `enterprise-agent-ops` | Oracle |
| `contract-first` | Orchestrator, oracle |
| `agent-introspection-debugging` | Orchestrator |
| `fastapi-patterns` | Fixer |

The orchestrator excludes the four oracle/fixer-only skills in every preset.
The fixer also receives `karpathy-guidelines` for coding work. For FastAPI,
add authorization checks rather than copying the skill's auth examples as-is.
Routing rules live in `opencode/oh-my-opencode-slim/orchestrator_append.md`.

## Bundled skill attribution

Selected skills are copied from
[Matt Pocock's skills](https://github.com/mattpocock/skills) under the MIT
License. Their source paths and content hashes are recorded in
`skills-lock.json`; the license text is in
`LICENSES/mattpocock-skills-MIT.txt`.

Twenty-five additional skills from
[langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills)
and [langchain-ai/langsmith-skills](https://github.com/langchain-ai/langsmith-skills)
are copied from their first ROOT-MIT-licensed revisions and attributed in
`LICENSES/langchain-ai-skills-NOTICE.txt`. The complete upstream MIT text is in
`LICENSES/langchain-ai-skills-MIT.txt`; source revisions, license URLs, scope,
and dates are recorded in the notice.

The unmodified `karpathy-guidelines` skill comes from
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills).
Its pinned source and upstream MIT declaration are recorded in
`LICENSES/andrej-karpathy-skills-NOTICE.txt` and `skills-lock.json`.

The curated ECC skills come from
[affaan-m/ecc](https://github.com/affaan-m/ecc) under the MIT License. Their
revision, source paths, and content hashes are recorded in `skills-lock.json`;
the license text is in `LICENSES/ecc-MIT.txt`.

## Add or update skills

Choose additional Matt Pocock skills interactively:

```sh
cd /pi_agent/agent_profiles/code
npx skills@latest add mattpocock/skills -a opencode
```

Install LangChain, LangGraph, and LangSmith skills (25 total) for the
`langchain-expert` agent:

```sh
cd /pi_agent/agent_profiles/code
npx skills@latest add langchain-ai/langchain-skills --skill '*' -a opencode
npx skills@latest add langchain-ai/langsmith-skills --skill '*' -a opencode
```

This is a project-scoped skills-cli install, not a global install. The
`.agents/skills` adapter routes selected files into `opencode/skills/`, where
only the `code` profile discovers them. The installer updates
`skills-lock.json` beside this README. Review skill and lock-file changes before
committing them. `/root/.agents/skills` remains untouched.

To remove the six ECC skills, run from this directory:

```sh
npx skills@latest remove agent-architecture-audit agent-harness-construction \
  enterprise-agent-ops contract-first agent-introspection-debugging fastapi-patterns -y
```

Check `skills-lock.json` afterward: project-scope removal may leave lock
entries. Revert the ECC agent-skill lists in `opencode/oh-my-opencode-slim.jsonc`
and the routing hints in `opencode/oh-my-opencode-slim/orchestrator_append.md`
by hand; remove `LICENSES/ecc-MIT.txt` and this documentation if no longer used.

Refresh the provider model list:

```sh
code models --refresh
```

OpenAI requests use `OPENAI_API_KEY` from the Compose environment (`.env`);
`code auth login` is only needed when authenticating another provider. The
OpenAI preset uses the model IDs published by OMO Slim. Check the model list
and adjust `opencode/oh-my-opencode-slim.jsonc` if the provider exposes
different IDs.

## Preset selection

Set the top-level `preset` in `opencode/oh-my-opencode-slim.jsonc` to
`openai`, `anthropic`, or `openrouter-free`; this profile currently uses
`openai`.
The Anthropic mappings are placeholders and must be replaced with model IDs
available to your account. For OpenRouter, run `/connect`, then verify
availability with `/models` before replacing the placeholders.

## Updates

- OpenCode, Pi, and Graphify: versions are pinned in `Dockerfile`; update them
  there and rebuild the image deliberately.
- OMO Slim: `3.0.6` is pinned in the image and profile config; automatic updates
  are disabled. Keep upgrade pins aligned across `Dockerfile` (global CLI),
  `opencode/opencode.jsonc` (server plugin), `opencode/tui.jsonc` (TUI plugin),
  `opencode/oh-my-opencode-slim.jsonc` (schema URL), this README, and
  `tests/code-profile-smoke.sh` (expected version). The global CLI install and
  OpenCode runtime plugin cache are distinct. Run `bash tests/check-fast.sh`;
  upgrades apply on the next OpenCode run (restart for immediate activation).
  Build Docker only when explicitly requested or investigating an installation
  failure.
- Tracked or manually installed skills: from this directory, update with
  `npx skills@latest update -p` when desired and review the resulting profile
  changes.

No Pi or OMO installer is required at runtime.
