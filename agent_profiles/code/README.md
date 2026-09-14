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

The profile-owned `opencode/mcp-defaults.jsonc` declares all four MCPs. Tavily
is enabled by default; DeepWiki and the LangChain guides/reference MCPs are
disabled by default. Set `TAVILY_API_KEY` outside tracked files; do not put the
key in this profile or a repository configuration file.

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

OMO Slim itself is loaded as the pinned `oh-my-opencode-slim@2.2.17` npm plugin.
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
LangChain, LangGraph, LangSmith, and Deep Agents. It investigates through
repository inspection and its dedicated MCPs; it is not an implementation
writer. The orchestrator routes ecosystem work to it, passes the repository
root, files, error text, and any LangSmith trace ids because subagents run in an
isolated context, and receives an implementation-ready, evidence-backed
handoff for the orchestrator or fixer.

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

It accesses three MCPs: `docs-langchain`, `reference-langchain`, and
`langsmith`. The `langsmith` MCP uses EU LangSmith OAuth; no API key is
configured or supplied by this profile. After changing MCP configuration,
restart OpenCode, then authenticate interactively with:

```sh
opencode mcp auth langsmith
```

Complete the browser OAuth flow before using the LangSmith tools.

## Bundled skill attribution

Selected skills are copied from
[Matt Pocock's skills](https://github.com/mattpocock/skills) under the MIT
License. Their source paths and content hashes are recorded in
`skills-lock.json`; the license text is in
`LICENSES/mattpocock-skills-MIT.txt`.

Twenty-five additional skills from
[langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills)
and [langchain-ai/langsmith-skills](https://github.com/langchain-ai/langsmith-skills)
are installed and attributed in `LICENSES/langchain-ai-skills-NOTICE.txt`. These
repositories do not declare a license at the repository level.

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
- OMO Slim: version `2.2.17` is pinned in the profile config and automatic
  updates are disabled; update the plugin and schema versions deliberately.
- Tracked or manually installed skills: from this directory, update with
  `npx skills@latest update -p` when desired and review the resulting profile
  changes.

No Pi or OMO installer is required at runtime.
