---
name: second-brain-update
description: Reconciles existing PARA vault knowledge from user-confirmed facts or changed state, including corrections, status updates, removals, and downstream source-of-truth updates. Use for ordinary vault mutations that are not external-source ingestion, primary-page lifecycle changes, or lint repairs.
---

# Vault update

Use this workflow for durable changes based on the user's direct knowledge, an established vault conclusion, or changed project state. Preserve provenance: a user-confirmed claim may be recorded as self-attested, but it does not become externally verified.

## Establish scope and authority

1. Operate only against a trusted PARA vault. Normally the current directory must contain `AGENTS.md` and the numbered PARA indexes. A caller may instead supply one canonically resolved linked Project inside that vault; in that case, stay inside the validated Project and its required indexes unless the approved update explicitly affects another indexed page.
2. Read the vault `AGENTS.md` in full, then start at the relevant category and item indexes.
3. Classify each candidate conclusion:
   - **user-confirmed** — stated or corrected directly by the user;
   - **vault-supported** — established by the vault's authoritative page or retained evidence;
   - **inferred** — plausible but not established;
   - **externally sourced** — materially depends on an article, document, webpage, repository, or other external source.
4. Load `second-brain-ingest` for externally sourced material. Do not launder an external claim through this workflow. When ingestion has already validated the source and delegates supported downstream reconciliation back here, accept that classification and do not restart ingestion.
5. Identify the page that owns the current conclusion and any downstream profile, inventory, plan, question, or index that materially depends on it. Follow the vault's documented source-of-truth direction.
6. If the candidate adds no durable knowledge or current-state change, report a no-op.

## Plan the reconciliation

1. Re-read every page that may be changed and the smallest set needed to detect a contradiction.
2. For a Project update, read [project-reconciliation.md](references/project-reconciliation.md).
3. Load `second-brain-primary-page` before creating, moving, merging, or archiving a primary page.
4. Determine what will be replaced, removed, retained as qualified history, or marked unresolved. Never invent rationale or silently choose between conflicting claims.
5. Present the proposal required by `AGENTS.md` and wait for unambiguous approval. Invocation authorizes inspection only.

## Apply approved operations

1. Re-resolve each destination immediately before editing.
2. Apply targeted edits that put the current conclusion first and preserve unrelated user-written content.
3. Replace superseded current state rather than appending an update log. Qualify self-attested claims when independent verification matters.
4. Create a supporting note or decision only when it retains distinct evidence, rationale, commitments, or unresolved context.
5. Update indexes only when navigation, lifecycle, listed summary, or listed status changes.
6. Execute only approved paths and operations. Stop for a revised proposal when the required destination, operation, or conclusion changes materially.

## Verify

1. Re-read every changed file and confirm frontmatter, wording, and intended authority.
2. Check changed wikilinks and index reachability.
3. Confirm superseded claims no longer remain active elsewhere and source-of-truth direction is intact.
4. Confirm no unrelated vault content changed.
5. Report changed paths, conclusions reconciled, discarded or qualified information, and unresolved conflicts.

## Boundaries

- External-source processing belongs to `second-brain-ingest`.
- Primary-page lifecycle changes require `second-brain-primary-page`.
- Repairs selected from a lint report remain under `second-brain-lint`.
- Chat-only answers and read-only vault questions belong to `second-brain-query`.
