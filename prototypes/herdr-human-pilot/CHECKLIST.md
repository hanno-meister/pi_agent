# Human Herdr pilot checklist

First create and enter the staging directory; the two prototype files must be placed there before setup downloads Herdr with curl:

```sh
mkdir -p /tmp/herdr-human-pilot
cd /tmp/herdr-human-pilot
# Place pilot.sh and CHECKLIST.md here from the prototype tree.
chmod +x ./pilot.sh
./pilot.sh setup
./pilot.sh status | tee -a evidence.md
./pilot.sh attach
```

`setup --no-agents` creates only the disposable server/layout. Normal `setup` also starts named Pi/OpenCode agents; it sends no prompts.

The harness downloads Herdr v0.8.2 on first use and refuses any SHA-256 other than the platform digest: Linux `x86_64` `976150a14d490c94b243ea2e1a7eb2dfb67f12e36b182db90936f6728e6aecf4`, Linux `aarch64` `f55610658e1c2e0d2aaef730b4b2ab885f7f8ba00285ab372bfb14f2e3d5b40d`, macOS `arm64` `a5d4f4d504d8b309c91f811050559300faba31258425f53c50852fc96f6ae574`, or macOS `x86_64` `ab50262c8190cd7aa9056d249d255c08c328c3e8716de9cfa29db4f131b8e2c1`. Runtime config, sockets, sessions, integrations, logs, and the downloaded binary stay below this prototype directory. Existing Pi credentials are referenced through `PI_CODING_AGENT_DIR` (default `/root/.pi/agent`); secrets are neither copied nor printed.

On macOS, use Bash with curl and `shasum`; the harness falls back from unsupported fractional `date` output to whole-second milliseconds.

If macOS appears stuck after `pilot: starting isolated Herdr server (hp)`, readiness is bounded to 15 seconds. Ctrl-C is safe; run `./pilot.sh status`, then `./pilot.sh cleanup`, and inspect `.s/server.log` plus `.x/herdr/sessions/hp/herdr-server.log` if present.

Supported native Herdr assets: Linux `x86_64` / `aarch64`, and macOS `x86_64` / `arm64`. Unsupported `uname -s`/`uname -m` pairs fail before any download. If macOS reports Gatekeeper quarantine or developer verification, remediation is opt-in and limited to the downloaded binary's `com.apple.quarantine` attribute.

Refresh these two files from immutable commit `af2f5b2`:

```sh
curl -fsSL https://raw.githubusercontent.com/hanno-meister/pi_agent/af2f5b2/prototypes/herdr-human-pilot/pilot.sh -o pilot.sh
curl -fsSL https://raw.githubusercontent.com/hanno-meister/pi_agent/af2f5b2/prototypes/herdr-human-pilot/CHECKLIST.md -o CHECKLIST.md
```

## Interactive observations

- [ ] Pane focus is direct **Ctrl-h/j/k/l**; assess focus predictability. Keep **Ctrl-a** for non-pane actions.
- Ctrl-h and Ctrl-j can be delivered as Backspace/Enter by terminals and might not work; these are user-selected bindings.
- [ ] **Ctrl-n** creates a workspace and **Ctrl-w** opens the workspace picker; assess both actions.
- Ctrl shortcuts may be intercepted by terminal line editing or the outer terminal/OS; record the observed behavior rather than claiming a Herdr failure.
- Keybinding sweep: no duplicate configured chords; default bare h/j/k/l remain intentionally local to Navigate mode, while Ctrl-a remains the prefix for other native actions.
- [ ] Mouse: assess selection/copy, pane resize, and scroll. Note whether mouse capture interferes with terminal selection.
- [ ] Vi-like navigation: assess the direct Ctrl-h/j/k/l focus behavior; do not claim vi editor evidence.
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
