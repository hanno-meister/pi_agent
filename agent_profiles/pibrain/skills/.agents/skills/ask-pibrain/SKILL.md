---
name: ask-pibrain
description: Choose the appropriate second-brain workflow.
disable-model-invocation: true
---

# Ask Pibrain

Use the narrowest matching workflow:

- **Correct, reconcile, remove, or update established vault knowledge from user-confirmed facts or changed state** → `/skill:second-brain-update`.
- **Process an article, document, webpage, repository, or other external source** → `/skill:second-brain-ingest`.
- **Answer a question from the vault** → `/skill:second-brain-query`.
- **Create, move, merge, or archive a primary page** → `/skill:second-brain-primary-page`.
- **Audit vault health, then optionally repair selected findings** → `/skill:second-brain-lint`.
- **Run an adaptive learning session grounded in vault context** → `/skill:second-brain-learn`.

Useful standalone workflows:

- **Delegate primary-source reading** → `/skill:research`.
- **Stress-test an idea without persisting state** → `/skill:grill-me`.
- **Prepare questions for another person** → `/skill:to-questionnaire`.
- **Carry context to another harness, directory, or colleague** → `/skill:handoff`.
- **Rewrite an explanation that did not land** → `/skill:wait-what`.
- **Design or edit agent-facing instructions** → `/skill:writing-for-agents`.

External sources route through ingestion even when they ultimately cause an update. A `/skill:research` result is working material, not persisted vault knowledge, until ingestion handles it. Ordinary updates route through primary-page management only when a primary page's lifecycle changes.
