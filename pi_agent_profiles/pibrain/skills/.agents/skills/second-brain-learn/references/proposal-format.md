# Learning proposal formats

Use these structures as compact interfaces, not as mandatory wording.

## Context manifest

```md
## Proposed learning context

- C1 — [[vault/path]]: why this page may inform the goal
- C2 — [[vault/path]]: why this page may inform the goal
- C0 — No vault context

Confirm, add, or exclude IDs before retrieval continues.
```

Do not imply that proposed pages have already been read broadly. After confirmation, report the smaller set actually retrieved.

## Learning plan

```md
## Learning path

**Goal:** observable target capability
**Success check:** final application or explanation
**Expected scope:** concise estimate or time box

1. Reasoning unit
2. Reasoning unit
3. Final application

**Prerequisite gaps:** known gaps, or none found
**Foundations:** compact vault links and external citations
```

Use Mermaid instead of or alongside the numbered path only when branching dependencies become clearer.

## Unresolved conflict

Put this before ordinary extraction candidates:

```md
> [!warning] ⚠️ Unresolved conflict — X1
> **Position A:** claim and [[vault/source]]
> **Position B:** claim and [external source](https://example.com)
> **Why it matters:** consequence for teaching or persistence
> **Disposition:** excluded from normal persistence
```

If useful, propose preserving the disagreement itself under a separate knowledge ID. Do not treat that as resolution.

## Consolidation proposal

```md
## Knowledgebase candidates

### K1 — Short title
- **Conclusion:** exact polished learning
- **Support:** supported | inferred | unresolved
- **Evidence:** vault links, external citations, or retained derivation
- **Understanding:** demonstrated | partially demonstrated | not tested
- **Destination:** full vault-relative wikilink, or proposed new home
- **Operation:** update | create | no-op

## Learner-model candidates

### L1 — Short capability or corrected misconception
- **Kind:** capability | corrected misconception
- **Understanding:** demonstrated | partially demonstrated
- **Demonstration:** brief observable evidence from this session
- **Context:** applicable vault link or topic
- **Operation:** add | update | supersede | no-op

## Teaching-profile candidates

### T1 — Short preference
- **Preference:** precise proposed preference
- **Basis:** explicit statement | repeated pattern requiring confirmation
- **Operation:** add | update | remove | no-op

## Approval

Approve, edit, or reject IDs separately, for example:
- Knowledgebase: approve K1; edit K2 …; reject K3
- Learner model: approve L1
- Teaching profile: reject T1
```

Never substitute one blanket approval when operations or destinations remain ambiguous. Omit empty candidate sections only after explicitly stating that no candidates were found.
