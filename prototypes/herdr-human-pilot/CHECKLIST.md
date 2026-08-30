# Human Herdr pilot checklist

Run inside the target container from this directory. `setup --no-agents` creates only the disposable server/layout. Normal `setup` also starts named Pi/OpenCode agents; it sends no prompts.

```sh
./pilot.sh setup
./pilot.sh status | tee -a evidence.md
./pilot.sh attach
```

The harness downloads Herdr v0.8.2 on first use and refuses any SHA-256 other than the required digest. Runtime config, sockets, sessions, integrations, logs, and the downloaded binary stay below this prototype directory. Existing Pi credentials are referenced through `PI_CODING_AGENT_DIR` (default `/root/.pi/agent`); secrets are neither copied nor printed.

## Interactive observations

- [ ] Pane focus is direct **Alt-h/j/k/l**; assess focus predictability. Keep **Ctrl-a** for non-pane actions.
- Ctrl-h/j/k/l collide with terminal Backspace/Enter/control input, so pane focus uses Alt-h/j/k/l.
- [ ] **Alt-n** creates a workspace and **Alt-w** opens the workspace picker; assess both actions.
- Alt shortcuts may be intercepted by the outer terminal or OS; record the observed behavior rather than claiming a Herdr failure.
- Keybinding sweep: no duplicate configured chords; default bare h/j/k/l remain intentionally local to Navigate mode, while Ctrl-a remains the prefix for other native actions.
- [ ] Mouse: assess selection/copy, pane resize, and scroll. Note whether mouse capture interferes with terminal selection.
- [ ] Vi-like navigation: assess the direct Alt-h/j/k/l focus behavior; do not claim vi editor evidence.
- [ ] Agent sidebar: observe named agents while working and idle; record any naturally occurring blocked/approval prompt only. Do not create unsafe approvals.
- [ ] Inspect agent `list`, `get`, `explain`, and `read`; note working/idle/done/blocked behavior and whether attention is visible.
- [ ] Detach/reattach: press **Ctrl-a q**, then from a second terminal run `./pilot.sh attach`.
- [ ] Capture status before and after SSH loss from a second terminal:

```sh
./pilot.sh status | tee -a evidence.md
# From the second terminal, force only that SSH connection down, then reconnect.
./pilot.sh status | tee -a evidence.md
```

Do not claim SSH evidence unless this is actually performed. Preserve both status outputs in `evidence.md`.

## Cleanup

After detaching and saving observations:

```sh
./pilot.sh status | tee -a evidence.md
./pilot.sh cleanup
```

Cleanup removes only this harness's named Herdr session/processes, temporary HOME/XDG state, config, integrations, logs, and downloaded binary. It preserves `pilot.sh`, this checklist, and evidence files.

## Docker limitation

Docker clean-build evidence cannot be tested in the current environment. On an approved host, use this minimal observation prompt (no repository edits):

> From a clean checkout, run the documented Docker/Compose clean build, preferably `docker compose build --no-cache`, then `docker compose up`. Record exact commands, image/build success, service health, relevant logs, and cleanup. Report failures and environment details only; do not modify the repository.
