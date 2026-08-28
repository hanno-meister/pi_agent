# Code profile

OpenCode profile with oh-my-opencode-slim. Optional third-party skills are installed manually.

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
├── skills/                       # manually installed + runtime OMO skills
└── oh-my-opencode-slim/          # profile-owned OMO prompt overrides
```

OMO Slim itself is loaded as the `oh-my-opencode-slim@latest` npm plugin. Its
built-in agents remain package-owned. OMO-managed bundled skills are synced by
the plugin into this profile's `skills/` directory; their runtime metadata and
bundled directories are ignored by Git. No third-party skills are bundled by
this profile.

## First-time setup

Install optional Matt Pocock skills manually and choose the skills interactively:

```sh
cd /pi_agent/agent_profiles/code
npx skills@latest add mattpocock/skills -a opencode
```

This is a project-scoped skills-cli install, not a global install. The
`.agents/skills` adapter routes selected files into `opencode/skills/`, where
only the `code` profile discovers them. The installer writes `skills-lock.json`
beside this README. Both the selected files and lock remain untracked until you
deliberately commit them. `/root/.agents/skills` remains untouched.

Then authenticate and refresh models:

```sh
code auth login
code models --refresh
```

The OpenAI preset uses the model IDs published by OMO Slim. Check the model
list and adjust `opencode/oh-my-opencode-slim.jsonc` if the authenticated
provider exposes different IDs.

## Updates

- OpenCode and Pi: versions are pinned in `Dockerfile`; update them there and
  rebuild the image deliberately.
- OMO Slim: version `2.2.17` is pinned in the profile config and automatic
  updates are disabled; update the plugin and schema versions deliberately.
- Manually installed skills: from this directory, update with
  `npx skills@latest update -p` when desired and review the resulting profile
  changes.

No Pi or OMO installer is required at runtime.
