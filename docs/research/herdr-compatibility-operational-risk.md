# Herdr compatibility and operational risk

## Scope

This is a documentation-based compatibility and risk review for this repository's Dockerized OpenCode/Pi workflow. It is not a production migration plan or a substitute for a hands-on pilot. Claims below are limited to the cited first-party material and the cited v0.8.2 release metadata.

## What Herdr provides

- Herdr is a Rust-based PTY runtime with a server, TUI, CLI, and SSH access. It keeps terminal processes running independently of a connected client, which is relevant to disconnect resilience. ([README](https://github.com/herdrdev/herdr), [quick start](https://herdr.dev/docs/quick-start/), [how to work](https://herdr.dev/docs/how-to-work/))
- Its state model is agent-aware: sessions and panes can expose agent lifecycle/state information, and automation can react to those states rather than only to terminal text. ([session state](https://herdr.dev/docs/session-state/), [agent automation](https://herdr.dev/docs/agent-automation/))
- The documented restore integrations include OpenCode and Pi. That establishes a listed integration path, not compatibility with this repository's profiles, prompts, container layout, or installed versions. Those details require a pilot. ([session state](https://herdr.dev/docs/session-state/), [compare](https://herdr.dev/compare/))

The decision-relevant advantage over tmux is semantic agent coordination: Herdr models agent state and automation directly. tmux remains the more mature baseline for general terminal multiplexing and this repository already has a configured, persisted, smoke-tested tmux workflow. ([compare](https://herdr.dev/compare/))

## Compatibility and operational risks

| Area | Evidence-backed assessment | Operational implication |
| --- | --- | --- |
| Runtime and persistence | Herdr uses a PTY server and persistent processes, with CLI/TUI and SSH workflows. ([README](https://github.com/herdrdev/herdr), [how to work](https://herdr.dev/docs/how-to-work/)) | Promising fit for durable remote sessions, but recovery behavior must be measured rather than inferred. |
| OpenCode/Pi | OpenCode and Pi are listed restore integrations. ([session state](https://herdr.dev/docs/session-state/)) | Detection and restore fidelity for this image remain unverified. |
| Host/remote support | The documented remote target is Linux/macOS; Windows is described separately as beta with constraints. ([how to work](https://herdr.dev/docs/how-to-work/), [Windows beta](https://herdr.dev/docs/windows-beta/)) | Do not treat Windows as an equivalent supported target for this workflow without a separate test. |
| Docker | A containerized deployment is plausible because Herdr exposes a server/CLI runtime, but the first-party quick-start material does not establish a supported container image or Docker deployment recipe. ([quick start](https://herdr.dev/docs/quick-start/), [README](https://github.com/herdrdev/herdr)) | Installation and operation inside the current container are an explicit pilot gate. |
| tmux replacement | Herdr's documented model and API are not tmux configuration/API-compatible. ([compare](https://herdr.dev/compare/), [socket API](https://herdr.dev/docs/socket-api/)) | Existing `tmux.conf`, scripts, bindings, and tmux clients cannot be assumed portable; retaining tmux is the rollback baseline. |
| Control plane | Plugin commands are unsandboxed, and the socket API can control processes and pane input/output. ([plugins](https://herdr.dev/docs/plugins/), [socket API](https://herdr.dev/docs/socket-api/)) | Treat plugins and socket access as trusted-code/process-control capabilities; review permissions and exposure before remote use. |
| Data exposure | Optional pane history can retain terminal content, potentially including secrets. ([session state](https://herdr.dev/docs/session-state/)) | Decide whether history is enabled, where it is stored, and how it is scrubbed before adoption. |
| Installation and supply chain | The quick start uses a curl-based installer. ([quick start](https://herdr.dev/docs/quick-start/)) | Pin and verify installation inputs in the image build; do not treat an unpinned curl pipeline as sufficient provenance. |
| Maturity | Herdr is pre-1.0; the cited GitHub release is v0.8.2, dated 2026-08-19. Release metadata includes published artifact digests. ([GitHub API](https://api.github.com/repos/herdrdev/herdr), [v0.8.2 release](https://github.com/herdrdev/herdr/releases/tag/v0.8.2)) | Early-adopter risk is material; pin versions and retain a tested rollback path. |

## Pilot gates still unresolved

Before replacing the current tmux runtime, test all of the following in the actual image and workflow:

1. Installation and sustained operation inside the current container, including persistence across container lifecycle events.
2. OpenCode and Pi detection/restore fidelity with this repository's profiles and versions.
3. Disconnect and reconnect recovery over SSH, including persistent processes and agent state.
4. Key, clipboard, navigation, copy-mode, and other important tmux ergonomic parity requirements.
5. Crash, restart, upgrade, downgrade, and rollback behavior, including state integrity and secret handling.

## Finding

First-party documentation supports a bounded compatibility pilot, not a documentation-only production replacement of tmux. Herdr should be evaluated for its semantic agent-coordination advantage while tmux remains the mature, operational rollback baseline. Adoption requires passing every pilot gate above and recording measured results.

## Sources

- [Herdr repository README](https://github.com/herdrdev/herdr)
- [Herdr documentation](https://herdr.dev/docs/)
- [Herdr comparison](https://herdr.dev/compare/)
- [Quick start](https://herdr.dev/docs/quick-start/)
- [Remote workflows](https://herdr.dev/docs/how-to-work/)
- [Agent automation](https://herdr.dev/docs/agent-automation/)
- [Socket API](https://herdr.dev/docs/socket-api/)
- [Session state](https://herdr.dev/docs/session-state/)
- [Plugins](https://herdr.dev/docs/plugins/)
- [Windows beta](https://herdr.dev/docs/windows-beta/)
- [GitHub repository API](https://api.github.com/repos/herdrdev/herdr)
- [v0.8.2 release](https://github.com/herdrdev/herdr/releases/tag/v0.8.2)
