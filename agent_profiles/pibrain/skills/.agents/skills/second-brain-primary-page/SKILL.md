---
name: second-brain-primary-page
description: Resolves or safely creates, moves, merges, or archives the single primary second-brain page for a subject while preventing duplicates and maintaining links and indexes. Use only for primary-page lifecycle changes.
---

# Primary page management

A primary page is the vault's designated main page for one subject. Use this skill only when creating, moving, merging, or archiving such a page. Do not load it for source notes, meeting notes, temporary notes, ordinary edits to established pages, or chat-only queries.

## Resolve the subject

1. Read the relevant PARA category and item indexes.
2. Search every PARA container, including `30-archives/`, for the subject's:
   - filename and title;
   - aliases, abbreviations, former names, and alternate spellings;
   - stable external identifiers, when available;
   - semantically similar pages, not only exact text matches.
3. Decide whether a candidate represents the same entity, concept, responsibility, decision, or outcome at the same scope.
4. If identity and scope match, use or update the existing primary page instead of creating another. Record alternate names in its `aliases` property.
5. If identity or scope is uncertain, ask the user. Do not create or merge automatically.
6. If no match exists, determine the page's home before creating it:
   - when the subject supports an existing PARA item, place it in that item's applicable `notes/` or `decisions/` folder and catalog it in the item index;
   - when the subject warrants a new Project, Area, or Resource, create the required item folder, `index.md`, and primary `<item>.md` page together;
   - when the correct home or level is uncertain, ask the user.

## Move or archive

Preserve the page's filename where practical, identity, aliases, source links, inbound links, and useful context. Remove it from the old category index and add it to the new one.

## Merge confirmed duplicates

1. Keep the better-established or better-linked page as the primary page.
2. Combine unique content, source links, aliases, and recorded decisions.
3. Update inbound links and relevant indexes.
4. Add obsolete titles as aliases.
5. Remove the redundant page only after its useful content and links are accounted for.

## Finish

1. Update affected indexes for any create, move, rename, merge, archive, or removal. If the existing primary page is reused without a lifecycle change, update an index only when its listed summary, status, or navigation information changes.
2. Re-read every changed file and confirm its frontmatter, identity, aliases, and intended content.
3. Check that updated inbound links resolve, obsolete paths are no longer referenced, and the page remains reachable through the index hierarchy.
4. Confirm that no duplicate primary page remains and that unrelated files were not changed.
5. Report the page used, created, moved, merged, or archived and any unresolved ambiguity.

## Boundaries

- Do not create a primary page when one already exists for the same subject and scope.
- Do not merge subjects merely because they are related.
- Do not invent missing information.
- Do not modify unrelated or user-authored files for consistency alone.
