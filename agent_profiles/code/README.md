# Code profile

OpenCode profile with oh-my-opencode-slim. Optional third-party skills are installed manually.

## Start

Inside the development container:

```sh
cd /pi_agent/workspaces/projects/<repository>
code
```

`code` is a global launcher for OpenCode. It scopes the profile through
`XDG_CONFIG_HOME`, enables OMO Slim background subagents and Exa search, then
forwards all arguments to `opencode`. Plain `opencode` is unchanged.

Project `opencode.json`, `.opencode/`, agents, skills, and instructions remain
higher-precedence project configuration.

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

- OpenCode: rebuild the image to retrieve `opencode-ai@latest`.
- OMO Slim: loaded as `@latest`; its updater and OpenCode cache determine when a
  new package is resolved.
- Manually installed skills: from this directory, update with
  `npx skills@latest update -p` when desired and review the resulting profile
  changes.

No Pi or OMO installer is required at runtime.
