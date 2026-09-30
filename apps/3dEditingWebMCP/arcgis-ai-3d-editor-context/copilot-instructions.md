# Copilot repository instructions

This project is a TypeScript browser editor for ArcGIS-hosted 3D objects. Read `docs/architecture.md` for the design and milestones and `AGENTS.md` for the workflow.

- Use ArcGIS Maps SDK for JavaScript and an editable 3D Object SceneLayer with a qualifying associated FeatureLayer. Verify actual editing, change tracking, GLB, and mesh-query capabilities before attempting hosted geometry edits.
- Keep WebMCP registration as a thin, optional adapter around application commands used by the visible UI. Do not put ArcGIS editing logic inside `registerTool` callbacks.
- Stage transforms on a cloned mesh in a local edit session. Show preview and require explicit approval in the application before a service write. Check individual `applyEdits()` results and requery after saving.
- Validate feature identity, finite values, coordinate system, units, and relevant service permissions. Never send entire mesh buffers to an agent when a compact summary will do.
- Implement and test the smallest complete milestone with runnable code. Keep the UI useful if WebMCP is unavailable. Use disposable test data for service write verification.
- Do not add ArcGIS Pro/C#, an MCP server, mesh repair, Boolean modeling, or printer export to the MVP unless explicitly requested.
