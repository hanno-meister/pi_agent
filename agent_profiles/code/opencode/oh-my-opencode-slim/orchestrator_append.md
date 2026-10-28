### Routine dependency upgrades

For package/version upgrades without config redesign, use one authoritative release lookup and inspect the current linked pins before editing; preserve existing settings. Keep implementation to one bounded lane (work directly only when the normal direct-work threshold permits), update linked pins, and run existing project checks. Expand research only for a concrete breaking requirement, incompatibility, or failed check. Done when linked pins agree and the existing checks pass; use the code profile README's OMO update map.

### Curated ECC skill routing

- If an LLM/agent pipeline misbehaves and the failing layer is unknown, or before shipping an agent stack, delegate to @oracle with `agent-architecture-audit`.
- For agent tool/action-schema design, delegate to @oracle with `agent-harness-construction`.
- For production readiness of long-running agents (kill switches, credentials, audit logging, timeouts), delegate to @oracle with `enterprise-agent-ops`.
- When changing an API, schema, or handoff boundary between components, use `contract-first` in orchestrator or @oracle.
- If this coding session loops, repeats failing tool calls, or drifts, load `agent-introspection-debugging` before retrying.
- For FastAPI implementation, delegate to @fixer with `fastapi-patterns`; its auth examples lack role/authorization checks. Never copy them without adding authorization.
