# ECC profile

An isolated OpenCode profile with [Everything Claude Code](https://github.com/affaan-m/ECC)'s
native OpenCode agents, commands, instructions, skills, and plugin. The existing
`code` profile remains unchanged; this profile does not load OMO Slim or Graphify.
The catalog includes 26 configured agents, 35 command files, and 293 skills.

## Launch

After rebuilding the container:

```sh
cd /pi_agent/workspaces/projects/<repository>
ecc
```

Before rebuilding, invoke the tracked launcher directly:

```sh
bash /pi_agent/agent_profiles/ecc/ecc
```

OpenCode installs the pinned `ecc-universal@2.2.3` dependency on first use,
requiring network access.
Connect a provider and select a model in OpenCode; ECC agents inherit that model.
Provider credentials supplied through environment variables remain available.
Existing `code`/global OpenCode logins are not copied: authenticate separately
with `ecc auth login` if needed.

## Isolation and safety

HOME, XDG directories, OpenCode's database, and npm/Bun caches live under the
ignored `runtime/` directory. Configuration and bundled assets are profile-local.
Runtime state, including credentials, is not encrypted; deleting `runtime/`
removes this profile's logins and session data.

Project configuration and project instructions remain enabled, so a repository
can add or override behavior. ECC's plugin executes code inside OpenCode and
includes automatic formatting in strict hook mode and other hooks. A local
adapter removes ECC's unconditional `permission.ask` auto-approval handler;
normal approval gates remain enabled. This is not an execution sandbox.

## Upstream and updates

Plugin and bundled assets use ECC **2.2.3**, source commit
`c05b2d6614f62f6db0047669aa4eefb223d478f9`. Bundled material retains upstream
licensing and provenance in this profile. Update the plugin pin, catalog assets,
and provenance together, then run:

```sh
bash tests/ecc-profile-smoke.sh
bash tests/check-fast.sh
```

This is ECC's native OpenCode integration, not Claude Code feature parity;
upstream labels OpenCode support beta. No upstream home installer is run.
Optional tools, MCP servers, and services referenced by skills are not installed
or authenticated automatically. Claude-oriented examples use the profile path
guidance in `opencode/instructions/PROFILE.md`.
Quit and restart OpenCode after changing configuration, plugins, or skills.
