# Pull-request skill sources

Research for a proposed pull-request skill. Sources are first-party guidance
from Google and GitHub.

## Recommended foundation

- [Google Engineering Practices: The CL author's guide](https://google.github.io/eng-practices/review/developer/)
  - Author-side code-review guidance; its child pages cover descriptions, small
    changes, and handling reviewer comments.
- [Google Engineering Practices: Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html)
  - A description should record what changed and why. Its first line should be
    a focused imperative summary followed by a blank line; the body provides
    problem context, rationale, shortcomings, references, and durable context.
- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
  - A reviewable change is one self-contained change, includes related tests,
    leaves the system working, and contains the context reviewers need. It
    recommends splitting unrelated refactors from features or fixes.

## GitHub-specific mechanics

- [GitHub Docs: Creating a pull request](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request)
  - Documents base/head selection, title and description, draft PRs, issue
    links, reviewer requests, and `gh pr create` options.

## Proposed scope

Use the Google sources for universally applicable authoring/reviewability
principles. Use the GitHub documentation only for platform mechanics because
this repository uses GitHub issues and the `gh` CLI.
