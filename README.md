# Portable Agentic Development Environment

My personal, containerized workstation for software development, coding agents, and a durable second brain.

I built this project because I want the same environment on every machine I use: clone the repository, start Docker, and continue working. It combines my terminal and editor configuration with agent profiles, persistent state, private-project hydration, and smoke-tested safety boundaries.

It is also an inspectable record of how I approach agentic engineering: I build workflows where agents use tools, retrieve durable context, verify their work, and ask for approval before changing important knowledge.

## What is original and what is adapted

Good agentic work includes knowing when to build and when to adapt. This repository contains both, with provenance kept explicit.

| Component | Purpose | Provenance |
| --- | --- | --- |
| Docker environment and workspace hydration | Reproduce the workstation and safely hydrate private repositories | Designed and developed by me |
| Neovim, tmux, and shell configuration | Provide my portable terminal development workflow | Configured and maintained by me, using third-party tools and plugins |
| [`pibrain`](agent_profiles/pibrain/) | Operate and learn from a private PARA second brain | Original second-brain workflows developed by me with agent assistance; selected utility skills retained from Matt Pocock with attribution |
| [`pimatt`](agent_profiles/pimatt/) | Provide general software-engineering workflows | Primarily curated from [Matt Pocock's skills](https://github.com/mattpocock/skills), with local integration and explicit attribution |
| [`code`](agent_profiles/code/) | Run OpenCode with oh-my-opencode-slim orchestration | OpenCode and OMO Slim are installed packages; profile configuration is tracked locally and optional skills are installed manually |

Skills copied into `pibrain` and `pimatt` retain their upstream license, source path, and content hash under each profile's `skills/` directory. The `code` profile leaves optional third-party skill installation to the user.

## Original-work highlight: `pibrain`

`pibrain` is a Pi profile I designed for working with a long-lived private knowledge base without treating every generated statement as truth or silently rewriting established knowledge.

Its skills cover:

- source ingestion with duplicate detection and approval before writes;
- reconciliation of user-confirmed corrections and changed state;
- indexed vault queries with citations and explicit uncertainty;
- safe creation, movement, merging, and archival of primary pages;
- read-only linting before user-selected repairs;
- adaptive learning grounded in confirmed context and evidence.

### Adaptive learning workflow

The [`second-brain-learn`](agent_profiles/pibrain/skills/.agents/skills/second-brain-learn/SKILL.md) skill is based on two ideas:

- the PARA organization method from Tiago Forte's *[Building a Second Brain](https://www.buildingasecondbrain.com/book)*;
- the learning process shown in Eero Alvar's *[How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU)*.

I developed those ideas into a stateful agent workflow that:

1. defines an observable learning goal;
2. retrieves only user-confirmed private context;
3. probes current understanding;
4. builds and verifies a dependency-aware learning path;
5. teaches and adapts based on demonstrated understanding;
6. separates evidence quality from quiz performance;
7. exposes conflicting evidence instead of silently choosing a side;
8. proposes knowledge, learner-state, and teaching-profile updates separately;
9. persists only explicitly approved changes;
10. runs a final read-only vault health check.

This is the kind of agentic work I am interested in: not a single clever prompt, but a bounded process with state, tools, evidence, feedback, and human control.

## Architecture

```mermaid
flowchart LR
    H["Host: Linux, Raspberry Pi, macOS, or WSL"] -->|"Docker Compose"| C["Persistent development container"]

    R["Public Git repository"] --> C
    R --> D["Authored dotfiles"]
    R --> P["Tracked agent profiles"]

    D --> C
    P --> C
    P --> PB["pibrain: original second-brain workflows"]
    P --> PM["pimatt: curated Pi coding workflows"]
    P --> PC["code: OpenCode + OMO Slim workflows"]

    C --> V["Docker volumes: agent, editor, tmux, and OpenCode state"]
    C --> W["Ignored runtime workspaces"]
    W --> S["Private second brain"]
    W --> A["Private project repositories"]

```

The public repository contains the environment and workflow definitions. Private knowledge and active project checkouts remain in ignored runtime paths.

## Design requirements

- **Portable:** support 64-bit x86 and ARM Docker hosts.
- **Reproducible:** install the same shell, editor, agent, and supporting tools from the Dockerfile.
- **Persistent:** retain generated Pi, Neovim, and tmux state in Docker volumes.
- **Inspectable:** keep authored configuration, skills, and integration code in Git.
- **Private by default:** exclude runtime projects and the second brain from the public repository.
- **Conservative startup:** clone only missing repositories; never synchronize or rewrite existing checkouts.
- **Failure tolerant:** report inaccessible remotes or invalid manifests without making the generic container unusable.
- **Human controlled:** require approval before agent workflows persist consequential knowledge changes.

## Quick start

### Prerequisites

- Docker Engine and Docker Compose
- Git
- Optional access to private remotes

Start the environment from the repository root:

```sh
docker compose up --build --detach
docker compose exec pi bash
```

The checkout is mounted at `/pi_agent`. Start the appropriate profile inside the container:

```sh
# Pi coding session
cd /pi_agent/workspaces/projects/<repository>
pimatt

# OpenCode coding session
cd /pi_agent/workspaces/projects/<repository>
code

# Second-brain session
cd /pi_agent/workspaces/second_brain
pibrain
```

Stop the environment without deleting persistent volumes:

```sh
docker compose down
```

## Optional local configuration

Copy the example environment file and set only what the current machine needs:

```sh
cp .env.example .env
```

Available settings include provider credentials and Git author identity. `.env` is ignored, and the container starts without provider credentials.

## Portability and verification

I use this environment on:

- Linux on x86-64;
- Raspberry Pi on 64-bit ARM;
- macOS through Docker;
- Windows through WSL.

The Docker image explicitly supports `amd64` and `arm64`. Automated end-to-end verification currently runs on Linux:

```sh
tests/compose-smoke.sh
```

The smoke test verifies startup without provider credentials, profile discovery, configuration symlinks, and Pi/OpenCode availability.

## License and attribution

My original work in this repository is available under the [MIT License](LICENSE). Third-party tools, plugins, and bundled material remain subject to their own licenses.

The skills copied from [`mattpocock/skills`](https://github.com/mattpocock/skills) for `pibrain` and `pimatt` retain their MIT license and provenance records under those profiles' `skills/LICENSES/` and `skills/skills-lock.json` paths. `code` does not bundle them.
