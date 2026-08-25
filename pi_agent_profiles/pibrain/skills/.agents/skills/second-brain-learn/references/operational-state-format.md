# Operational learning state

These files are operational inputs under `90-system/`, not PARA knowledge pages. Do not add them to PARA indexes.

Create either file only when its first approved entry is ready to persist. Use ISO dates in the user's local timezone. Keep entries sparse and human-readable.

## Learner model

Path: `90-system/learning/learner-model.md`

```md
# Learner model

Sparse, approved evidence used to calibrate future learning sessions. Entries are hypotheses to re-check when critical, stale, or contradicted.

## Active entries

### LM-YYYYMMDD-short-slug

- **Kind:** capability | corrected misconception
- **Claim:** precise statement about demonstrated understanding
- **Understanding:** demonstrated | partially demonstrated
- **Demonstration:** brief observable evidence
- **Context:** [[optional/vault/context]] or plain topic
- **Last demonstrated:** YYYY-MM-DD

## Superseded entries

### LM-YYYYMMDD-old-slug

- **Superseded by:** LM-YYYYMMDD-new-slug
- **Previous claim:** precise prior statement
- **Reason:** later evidence that changed the assessment
```

Rules:

- Record demonstrated use, not mere exposure or material covered.
- A user's unsupported claim of prior familiarity may guide probing but is not `demonstrated` evidence.
- Merge equivalent evidence into an existing entry and refresh its demonstration/date when appropriate.
- When later evidence contradicts an entry, move or copy it under `Superseded entries` and point to the replacement. Do not erase the history silently.
- Do not assign personality traits, ability scores, numeric confidence, or speculative weaknesses.

## Teaching profile

Path: `90-system/learning/teaching-profile.md`

```md
# Teaching profile

Approved preferences for how learning sessions should present and test material.

## Preferences

### TP-YYYYMMDD-short-slug

- **Preference:** precise, actionable teaching preference
- **Basis:** explicit statement | confirmed repeated pattern
- **Confirmed:** YYYY-MM-DD
```

Rules:

- Keep preferences concrete enough to affect teaching behavior.
- Do not infer identity, personality, aptitude, or motivation.
- A repeated behavior may generate a proposal, but only confirmation makes it a profile entry.
- Update or remove a preference when the user approves the change; do not preserve obsolete variants as active guidance.
- Do not put domain knowledge or demonstrated capabilities in this file.
