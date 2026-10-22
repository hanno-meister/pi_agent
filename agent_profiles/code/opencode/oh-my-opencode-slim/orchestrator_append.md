### Routine dependency upgrades

For package/version upgrades without config redesign, use one authoritative release lookup and inspect the current linked pins before editing; preserve existing settings. Keep implementation to one bounded lane (work directly only when the normal direct-work threshold permits), update linked pins, and run existing project checks. Expand research only for a concrete breaking requirement, incompatibility, or failed check. Done when linked pins agree and the existing checks pass; use the code profile README's OMO update map.
