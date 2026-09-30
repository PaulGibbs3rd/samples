# ArcGIS AI 3D Editor — architecture and handoff

Status: proposed MVP, distilled from the design discussion on 2026-09-30. This document describes a project to build; it is not a claim that the application already exists.

## Goal

Build a browser application in which a person selects an ArcGIS 3D object, asks an agent to inspect or transform it, reviews a visible preview, and explicitly applies the edit to an editable service. The first useful demonstration is: select a building, inspect its dimensions, rotate it around its vertical axis, preview, and save. A person can perform the same operations with ordinary UI controls when WebMCP is unavailable.

## Decision and history

| Stage | Design | Outcome |
| --- | --- | --- |
| Initial | ArcGIS Pro SDK add-in, C# services, IPC, and an MCP server | Useful if controlling an active Pro project, local geodatabases, geoprocessing, or Pro's edit stack is the goal; too much infrastructure for the browser-based proof of concept. |
| Intermediate | Browser WebMCP panel bridged to an ArcGIS Pro add-in | Offers shared agent and human UI, but still needs a desktop bridge and Pro SDK threading/editing work. |
| Current MVP | TypeScript, ArcGIS Maps SDK for JavaScript, editable 3D Object SceneLayer, and a thin WebMCP adapter | WebMCP and scene editing run in one browser application. Start here for ArcGIS-hosted 3D objects. |

ArcGIS Pro integration and conventional MCP are possible future adapters, not MVP requirements. Keep the editing core independent from the agent transport.

## Proposed architecture

```text
Human controls ─┐
                ├─> application commands ─> edit session ─> ArcGIS SDK ─> hosted service
WebMCP tools ───┘            │                   │
                             └─ read summaries  └─ local preview and explicit save
```

Suggested modules (adapt to an existing repository rather than moving code gratuitously):

```text
src/
  arcgis/       scene, layer capabilities, hit testing, mesh retrieval
  editing/      selection identity, edit session, preview, validation, persistence
  geometry/     transforms and dimension summaries
  webmcp/       feature detection, registration, thin command adapters
  ui/           selection, proposal, preview, apply/cancel
```

The `webmcp/` module calls the same application commands as the visible UI. Neither tool registration nor a language model owns a mutable SDK `Mesh` or calls `SceneLayer.applyEdits()` directly.

## Data and editing prerequisites

- Use a real **3D Object SceneLayer** backed by an associated **FeatureLayer** that supports editing and change tracking. Geometry add/update/delete also needs GLB format enabled on the associated feature layer. Check the selected layer's actual capabilities at runtime; many public demonstration layers are read-only.
- Load by portal item when appropriate: Esri notes that the associated feature service relationship is stored at the item level and may not be discoverable from a bare scene service URL.
- Check that mesh geometry can be returned before assuming a clicked graphic contains editable geometry. Query the feature with `returnGeometry: true` when `capabilities.query.supportsReturnMesh` allows it. Keep the scene-layer instance, object ID, original mesh, and service identity together in the edit session.
- `Mesh` supports a transform and a deep `clone()`. Clone the original before changing preview state. Read the SDK's transform, offset, rotate, and scale semantics before combining them, especially spatial reference units, pivot, orientation, and Z units. A phrase such as “five meters north” needs coordinate-aware handling rather than blindly adding 5 to longitude.
- Use `SceneLayer.applyEdits()` for supported service-backed saves. Inspect both rejected promises and per-feature error results. A returned promise alone is not proof that each feature was updated.
- A preview is local, nonpersistent state. Discard restores the original view. Saving refreshes the authoritative state and clears the edit session. For a later undo feature, define its service-side semantics and concurrency behavior; a local stack cannot reverse a saved service edit by itself.
- Scene-layer edits are applied to the associated feature service, while the scene cache may eventually need rebuilding. Account for live-edit display and cache limits in a production rollout.

## First workflow

1. Load a WebScene or an explicit editable 3D Object SceneLayer. Show the layer's title and editing capability status.
2. Select one object by clicking in the scene or by an explicit object ID. Resolve a stable identity and summarize its attributes and mesh bounds without sending a whole vertex buffer to the agent.
3. Create an edit session from a deep copy of the original geometry. Accept a finite rotation angle and calculate a candidate mesh. Use the same command from a human control and the WebMCP tool.
4. Draw a clearly labeled preview and show the target layer, object ID, operation, and angle. No service edit occurs yet.
5. Require explicit, fresh human approval in the application for this proposal. Revalidate selection, edit permission, and pending proposal identity immediately before save.
6. Apply through the SDK, inspect the result for the target object, update the UI, and requery as needed. On failure keep the original and offer retry/discard without falsely reporting success.

For concurrent editors, store a version or timestamp where the service supports it, detect stale proposals where possible, and avoid silently overwriting changed geometry.

## WebMCP surface

Register tools only when `document.modelContext` is available. The ordinary UI must keep working otherwise. The first set is deliberately small:

| Tool | Effect |
| --- | --- |
| `get_scene` | Summarize current scene and editable layer availability. |
| `get_selection` | Return selected layer and feature identity. |
| `inspect_selected_object` | Return dimensions, bounds, units, and relevant attributes. |
| `propose_rotation` | Validate input and create a local preview proposal. |
| `discard_proposal` | Clear pending preview. |

Add `apply_proposal` only after the app's own approval gate exists and is verified. A tool call must not be treated as that human approval. Set truthful WebMCP annotations such as `readOnlyHint` on inspection tools and `consequentialHint` for persistent saves. These annotations inform the browser/agent; they do not replace an application authorization check. Treat layer names, attributes, and other service content as untrusted input when surfaced to an agent.

Do not assume WebMCP is universally available or that a standard web page automatically supplies an AI agent. Verify a compatible browser/agent host, the feature's current enablement instructions, and a successful tool invocation. WebMCP is an experimental integration; isolate registration and cleanup in one adapter. Use the current Chrome imperative API documentation and TypeScript types when implementing it.

## Milestones and acceptance

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| 0 — feasibility | Browser scene and chosen editable service | Confirm 3D Object SceneLayer, associated feature layer, geometry edit and mesh query capabilities using a disposable feature. Record service/portal configuration without credentials. |
| 1 — browser editor | Selection, inspect, rotate, preview, apply/cancel through visible UI | A rotation preview never writes; cancel restores original; apply reports per-feature success and survives requery/reload. |
| 2 — WebMCP proof | Read tools and `propose_rotation` wrap existing commands | A compatible agent discovers tools and proposes a rotation; UI still works without WebMCP; only app-approved changes persist. |
| 3 — broader transforms | Translation and scaling with spatial reference/unit checks | Preview matches saved geometry, invalid inputs are rejected, and error states remain recoverable. |
| Later | Vertex edits, mesh repair, printing, multi-object sessions, conventional MCP or Pro adapters | Scope and validate separately; the base ArcGIS mesh API alone is not a complete mesh modeling/repair engine. |

Start with the smallest working vertical slice. Use a dedicated editable test layer and feature so verification does not alter production GIS data.

## Open decisions for the implementation repository

- Which ArcGIS Online or Enterprise portal, WebScene/item ID, test feature, and authentication mode will be used?
- Does that exact service expose editable 3D object meshes and the required GLB/change-tracking capabilities?
- Which compatible browser agent will invoke WebMCP during development?
- Should the UI start with one selected feature and Z-axis rotation only? This document assumes yes.

## Reference documentation

- [Esri SceneLayer editing and `applyEdits()`](https://developers.arcgis.com/javascript/latest/references/core/layers/SceneLayer/)
- [Esri `Mesh` and deep cloning](https://developers.arcgis.com/javascript/latest/references/core/geometry/Mesh/)
- [Esri `MeshTransform`](https://developers.arcgis.com/javascript/latest/references/core/geometry/support/MeshTransform/)
- [Esri 3D Editor component sample](https://developers.arcgis.com/javascript/latest/sample-code/editor-3d/)
- [Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)
