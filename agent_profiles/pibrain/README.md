# Pibrain profile

A tracked Pi profile for second-brain sessions. It loads original second-brain workflows and a focused set of standalone utility skills without disabling Pi's normal project-skill discovery.

## Start a second-brain session

```bash
cd /pi_agent/workspaces/second_brain
pibrain
```

`pibrain` explicitly loads `skills/.agents/skills/` because recursive discovery skips dot-prefixed directories. The profile includes ingestion, ordinary knowledge reconciliation, learning, linting, primary-page management, and vault-query workflows.

## Choose a workflow

Use `/skill:ask-pibrain` when unsure which second-brain flow fits. The router is user-invoked, so it adds no model-invocation context. Engineering build flows remain in `pimatt`; Pibrain retains only dependency-complete utilities useful during knowledge work.

## Shared skill attribution

Selected utility skills are copied from [Matt Pocock's skills](https://github.com/mattpocock/skills) under the MIT License. Their source paths and hashes are recorded in `skills/skills-lock.json`; the license is in `skills/LICENSES/mattpocock-skills-MIT.txt`. Original second-brain skills are not listed in that upstream lock.

## Add a skill

```text
skills/.agents/skills/
  my-workflow/
    SKILL.md
```

Every `SKILL.md` needs frontmatter with a lowercase `name` and a non-empty `description`.
