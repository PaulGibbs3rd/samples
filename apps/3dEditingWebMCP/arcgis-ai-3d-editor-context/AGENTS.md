# Agent guide

Read `docs/architecture.md` before changing the editor. This repository's current goal is a browser-based ArcGIS 3D editing proof of concept using TypeScript, ArcGIS Maps SDK for JavaScript, and an optional WebMCP adapter.

## How to work

1. Inspect the existing repository and its build scripts. Use its conventions; if the repository is empty, create the smallest runnable TypeScript application that meets the active milestone.
2. Start with `docs/architecture.md` milestone 0. Check a real test service's editing, change tracking, GLB, and mesh-query capabilities before implementing persistence. If credentials or an editable service are missing, implement the independent UI/logic with an explicit demo fixture, record the blocker, and do not claim hosted edits work.
3. Keep scene/layer access, geometry operations, edit-session state, persistence, WebMCP registration, and UI at clear boundaries. WebMCP tools call the same commands as the human controls.
4. For each edit, retain stable feature identity and an untouched deep copy. Validate units, finite values, permissions, and a fresh proposal before rendering or saving. Show the proposal to the user; require approval in the application immediately before `applyEdits()`.
5. Check per-feature edit results and reload/requery to verify a real save. Do not implement a pretend server undo. Handle cancellation, stale selection, network errors, and unsupported layers plainly.
6. Verify the behavior affected by the change. Test pure geometry/session logic with small deterministic fixtures; perform an end-to-end save only against an authorized disposable test feature. Run the project's typecheck/build and report what was and was not verified.

## Constraints

- No ArcGIS Pro SDK, C# bridge, or conventional MCP server for the MVP unless the project owner changes direction.
- WebMCP is optional at runtime. Feature-detect it and keep a complete human UI path. Isolate experimental browser APIs and tool lifecycle cleanup.
- Tool annotations are descriptive hints. An explicit application approval check controls persistent writes.
- Do not put API keys, tokens, private portal URLs, or secrets into committed code or agent outputs. Use documented configuration placeholders.
- Keep agent responses compact: IDs, dimensions, bounds, units, and proposed effects; omit full vertex arrays unless a concrete feature needs them.
- Do not claim that arbitrary SceneLayers can be edited. Check the actual service and SDK capability flags.

## Default next task

Implement milestone 0, then a one-feature rotate/preview/apply vertical slice from milestone 1. Stop persistent edits if no suitable test service is configured; make the capability report and UI behavior runnable and explain what test-service configuration is required.
