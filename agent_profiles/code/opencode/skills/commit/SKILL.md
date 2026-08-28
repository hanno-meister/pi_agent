---
name: commit
description: "Group changes into logical Conventional Commits. Use when committing work or writing a commit message."
---

# Commit

Examine the complete working tree before deciding what to commit. Group changes
by logical intent, then create as many commits as those groups require.

Follow repository instructions and commit tooling. Inspect recent commits when
their conventions are unclear.

## Group changes

Inspect staged, unstaged, and untracked changes.

Treat existing staging as a fact, not a request to commit it. If it already
forms a logical group, preserve it. If it mixes groups or its intent is unclear,
ask before changing it.

Account for every intended change: assign it to one group or explicitly leave
it uncommitted. Make each group one coherent change and keep unrelated changes
apart. Use selective staging when one file contains changes from multiple
groups.

Order commits by dependency where relevant; otherwise use the clearest
narrative order. Exclude generated, secret, local, and unclear files unless
their inclusion is established.

## Write the message

Use Conventional Commit style:

```text
<type>[optional scope]: <description>

[optional body]

[optional footers]
```

Treat 50 characters as the target for the complete subject, including its
prefix. Use a lowercase type and scope; capitalize the imperative description:

```text
fix(parser): Handle empty input
```

Apply these rules:

- Separate subject from body with a blank line
- Limit the subject line to 50 characters
- Capitalize the description after the Conventional Commit prefix
- Do not end the subject line with a period
- Use the imperative mood in the subject line
- Wrap the body at 72 characters
- Use the body to explain what and why vs. how

Read [EXAMPLE.md](EXAMPLE.md) when writing a body.

Use the body for the problem, motivation, side effects, or unintuitive
consequences. Do not narrate implementation details evident in the diff.

Mark breaking changes using Conventional Commit style. Add issue references
only when the task or repository provides them.

## Create commits

For each group:

1. Stage only that group.
2. Review the staged diff.
3. Write its message.
4. Create the commit when the surrounding task authorizes committing.

Create new commits only. Amend, squash, reorder, or rebase commits only on
explicit instruction.

## Done when

Follow verification required by the surrounding task or repository. Every
intended change is in its logical commit or deliberately left uncommitted, and
`git status` and `git log` show the expected remaining work and commit sequence.
