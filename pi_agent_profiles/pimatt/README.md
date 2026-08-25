# Pimatt profile

A tracked Pi profile for coding sessions. It supplies shared skills and slash
commands without disabling Pi's normal project-skill discovery.

```text
skills/
├── skills-lock.json   # Installed-skill lock file
├── .agents/skills/    # Canonical Agent Skills root
├── .pi/prompts/       # Pi commands loaded by pimatt
└── LICENSES/          # Required third-party attribution
```

## Start a coding session

```bash
cd /pi_agent/workspaces/projects/<repository>
pimatt
```

`pimatt` adds this profile's shared skills and prompt commands while preserving
Pi's native global and project-skill discovery. Pointing Pi directly at the
shared `.agents/skills` directory is required because recursive discovery skips
dot-prefixed directories. Project skills remain in their repository's standard
`.agents/skills/` or `.pi/skills/` directory.

## Second-brain commands

- `/link-second-brain [@project]` records one related second-brain project in
  the current repository's root `AGENTS.md`.
- `/update-second-brain` filters durable project knowledge from the current
  coding session, then delegates proposal, approval, reconciliation, and
  verification to Pibrain's shared `second-brain-update` workflow.

Both commands live under `skills/.pi/prompts/` and are loaded explicitly by
`pimatt`.

## Shared skill attribution

The bundled shared skills are copied from
[mattpocock/skills](https://github.com/mattpocock/skills) under the MIT License.
Their source paths and content hashes are recorded in `skills/skills-lock.json`;
the license text is in `skills/LICENSES/mattpocock-skills-MIT.txt`. Only skills
with redistribution permission belong in this profile.

## Add a skill

```text
skills/.agents/skills/
  my-workflow/
    SKILL.md
```

Every `SKILL.md` needs frontmatter with a lowercase `name` and a non-empty
`description`.
