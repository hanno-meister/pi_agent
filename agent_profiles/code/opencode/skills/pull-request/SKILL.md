---
name: pull-request
description: "Prepare and publish a reviewable GitHub pull request."
disable-model-invocation: true
---

# Pull Request

Make the pull request a durable record that lets reviewers and future readers
understand what changed, why, and how it was verified.

Treat pull-request preparation as packaging the existing change. Keep source
files, tests, commits, and history unchanged. Code-review findings are
report-only; surface them to the user rather than applying them.

Follow repository instructions, PR templates, tooling, and conventions first.

## Establish the change

Identify the current branch, intended base branch, commit range, and complete
diff. The base branch must be settled before reviewing the change. Confirm the
diff is non-empty.

Check whether a pull request already exists for the branch. Update it rather
than creating a duplicate.

A reviewable pull request is one self-contained change. It includes related
tests, leaves the system working, and contains the context a reviewer needs.
Separate unrelated refactors from features and fixes. If the change is too
large or mixed to review as one coherent unit, identify how it could be split
and ask before changing history or creating multiple pull requests.

## Review

Once the base and commit range are settled, run `/code-review <base-branch>`
unless an unchanged review already covers the exact range.

Report verification honestly. Include checks that ran and their results. Name
relevant checks that did not run and why. If verification is missing, expose
the gap and ask; do not invoke verification planning automatically.

## Write the pull request

Write a concise, imperative title following repository conventions. Without a
repository convention, do not force a Conventional Commit prefix.

Load and use the [pr skill](../pr/SKILL.md) to compose the body. Repository
instructions and templates take precedence over its suggested format. Explain
the motivation and important decisions, and include relevant limitations,
trade-offs, dependencies, side effects, or follow-up work. Report verification
honestly, including skipped checks and reasons as described in Review; use only
available evidence and never fabricate before/after evidence.

If a relevant originating issue is found, suggest its reference or closing
syntax, but ask before adding it. If no issue is found, omit issue-reference
text entirely. Never invent issue numbers or claim that an issue will close
without confirmation.

Never request reviewers.

## Prepare and publish

Use draft status while the change is incomplete, directionally uncertain, or
intended for early feedback. Mark it ready only when it is reviewable.

Before any external action, show the proposed:

- base and head branches
- title and complete description
- draft or ready state
- issue reference or closing relationship
- intended push, if any

Wait for explicit confirmation. This confirmation is required before `git push`,
`gh pr create`, or `gh pr edit`. Push only the current branch; never force-push
without separate explicit instruction.

If the branch has diverged from the base or cannot merge cleanly, report it and
ask before merging or rebasing.

After confirmation, use `gh` to create or update the pull request. Verify the
result and report its URL and final state.

## Done when

The pull request compares the intended branches, contains one reviewable
change, explains what and why, reports real verification evidence, has the
confirmed issue relationship and state, and its final GitHub state is verified.
