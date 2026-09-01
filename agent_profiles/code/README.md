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
create per-pane directories or copy auth and preference files.

Project `opencode.json` and `.opencode/` configuration load before the profile
directory. When settings conflict, profile configuration wins; project agents,
skills, and instructions remain available.

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

## Bundled skill attribution

Selected skills are copied from
[Matt Pocock's skills](https://github.com/mattpocock/skills) under the MIT
License. Their source paths and content hashes are recorded in
`skills-lock.json`; the license text is in
`LICENSES/mattpocock-skills-MIT.txt`.

## Add or update skills

Choose additional Matt Pocock skills interactively:

```sh
cd /pi_agent/agent_profiles/code
npx skills@latest add mattpocock/skills -a opencode
```

This is a project-scoped skills-cli install, not a global install. The
`.agents/skills` adapter routes selected files into `opencode/skills/`, where
only the `code` profile discovers them. The installer updates
`skills-lock.json` beside this README. Review skill and lock-file changes before
committing them. `/root/.agents/skills` remains untouched.

Then authenticate and refresh models:

```sh
code auth login
code models --refresh
```

The OpenAI preset uses the model IDs published by OMO Slim. Check the model
list and adjust `opencode/oh-my-opencode-slim.jsonc` if the authenticated
provider exposes different IDs.

## Updates

- OpenCode, Pi, and Graphify: versions are pinned in `Dockerfile`; update them
  there and rebuild the image deliberately.
- OMO Slim: version `2.2.17` is pinned in the profile config and automatic
  updates are disabled; update the plugin and schema versions deliberately.
- Tracked or manually installed skills: from this directory, update with
  `npx skills@latest update -p` when desired and review the resulting profile
  changes.

No Pi or OMO installer is required at runtime.
