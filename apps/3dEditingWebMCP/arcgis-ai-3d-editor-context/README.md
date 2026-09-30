# ArcGIS AI 3D Editor — browser 3D editing proof of concept

TypeScript browser app scaffolded with [`@arcgis/create`](https://www.npmjs.com/package/@arcgis/create) (Vite +
ArcGIS Maps SDK for JavaScript template). See [`docs/architecture.md`](./docs/architecture.md) for the full design
and milestone plan, and [`AGENTS.md`](./AGENTS.md) for the agent workflow.

## Status: milestone 1 — rotate/preview/apply editor

Milestone 0's capability report and milestone 1's rotate/preview/apply/cancel editor are both implemented and
live-verified end-to-end against a real enterprise test service. See "Data and editing prerequisites" and the
milestone plan in `docs/architecture.md`.

**No credentials or real service URLs are committed to this repository** — `.env` is git-ignored. Running the
app without a local `.env` shows an explicit demo fixture, clearly labeled as such. See
[Configure a real test service](#configure-a-real-test-service) below for how to point it at one.

Both milestones have been run against a real (anonymously-readable, editing-enabled) enterprise test item —
`SeattleCube_3DObject`, a single disposable cube published as a 3D Object SceneLayer + associated FeatureLayer.

### Milestone 0 findings

- It correctly identifies `geometryType: "mesh"` and resolves the associated FeatureLayer.
- The associated FeatureLayer reports `capabilities: Query,Create,Update,Delete,Uploads,Editing,ChangeTracking`
  and `allowGeometryUpdates: true`; the live report shows `supportsEditing`/`supportsAdd`/`supportsUpdate`/
  `supportsDelete` all `true` on both the SceneLayer and the associated FeatureLayer.
- **GLB/glTF format confirmed present**: inspecting the associated FeatureLayer's `query3d` response directly
  shows an `assetMaps` entry with `assetType: "3D_gltf"`, `conversionStatus: "COMPLETED"`, and a working,
  anonymously-fetchable `assetURL` — i.e. the Khronos glTF binary format required for web editing (Pro analyzer
  rule 24165) is present for this test feature.
- **`outFields: []` silently drops geometry (fixed):** the original capability-check code queried with
  `outFields: []`, which makes the service return `geometry: null` even with `returnGeometry: true`. Switching to
  `outFields: ["*"]` fixed this — the mesh query probe now correctly reports `Mesh returned: yes`.
- **3D Object geometry is always an empty placeholder Mesh — this is expected, not a blocker.** With
  `outFields: ["*"]`, `queryFeatures()` (bare, after adding the layer to a live view, and via `view.hitTest()` on
  the rendered graphic) all resolve `geometry` to a real `Mesh` **instance**, but with **0 vertices** in every
  case. The real rendering happens internally via the glTF asset referenced through `assetMaps`
  (`FeatureServer/0/query3d?formatOf3DObjects=3D_gltf`) and is never exposed as editable vertex data through the
  public query API. Milestone 1 therefore edits the object's transform **attributes**
  (`esri3do_tx/ty/tz`, `esri3do_rx/ry/rz`, `esri3do_rdeg`, `esri3do_sx/sy/sz`) directly, rather than mutating a
  `Mesh`/`MeshTransform`. The capability check now also reports whether these transform attributes are present
  (`hasTransformAttributes`) and blocks only if `esri3do_rdeg` specifically is missing.

### Milestone 1 findings

- The editor panel (object-id select, rotate-by-degrees input, Preview/Apply/Cancel) is implemented in
  `src/ui/editor-view.ts` + `src/ui/editor-controller.ts`, backed by a pure state machine
  (`src/editing/edit-session.ts`) and pure rotation math (`src/geometry/transform.ts`), with all SDK calls
  isolated in `src/arcgis/object-transform.ts` and orchestrated by `src/editing/commands.ts`'s `EditorCommands`
  class — the same class milestone 2's WebMCP adapter is expected to reuse.
- **Live-verified all four acceptance criteria** from `docs/architecture.md` against `SeattleCube_3DObject`
  (`OBJECTID=1`): selecting an object renders its attributes/footprint/current angle; previewing a rotation never
  writes to the service (confirmed via a direct REST query while a preview was pending); cancelling a preview
  restores the original angle and disables Apply/Cancel again; applying a rotation persists server-side
  (confirmed via direct REST query showing `esri3do_rdeg` updated) and survives a full page reload (re-selecting
  the object after reload shows the new angle).
- **`globalIdUsed` quirk on 3D Object FeatureLayers:** the first Apply attempt failed with
  `[feature-layer:invalid-parameter]: Feature should have 'globalid' when 'globalIdUsed' is true`. The SDK's
  `applyEdits()` computes `globalIdUsed = options?.globalIdUsed || (layer.infoFor3D != null)` internally — i.e.
  for any layer associated with a 3D Object SceneLayer (`infoFor3D` set), it **always** requires `globalid`-keyed
  updates, and passing `{ globalIdUsed: false }` as an `applyEdits()` option does **not** override this (`false ||
  truthy` still evaluates to the truthy value). The fix: `applyRotation()` reads the feature's `globalid` value
  (already present in the queried attributes from milestone 0's `outFields: ["*"]` fix) and includes it on the
  update `Graphic`, alongside the object id and the changed `esri3do_rdeg` value.
- Per-feature result inspection (checking `editsResult.updateFeatureResults[0].error` rather than trusting the
  resolved promise alone, per `docs/architecture.md`'s explicit warning) proved its value here: it correctly
  surfaced the `globalid` error as an apply failure instead of a false success.

## Project layout

```text
src/
  arcgis/   scene/layer loading and capability interpretation (types.ts, config.ts, capability-check.ts,
            capability-interpret.ts, demo-fixture.ts) plus milestone 1's SDK glue (object-transform.ts)
  ui/       capability-report-view.ts and editor-view.ts render report/editor state into the DOM;
            editor-controller.ts wires DOM events to EditorCommands (no @arcgis/core imports)
  editing/  milestone 1's pure edit-session state machine (edit-session.ts) and the shared
            EditorCommands class (commands.ts) that owns the FeatureLayer + every SDK call
  geometry/ pure rotation/transform math (transform.ts) — no @arcgis/core import, fully unit tested
  webmcp/   reserved for milestone 2 (WebMCP tool registration); will call into editing/commands.ts
  auth/     optional OAuth helper for secured portals (not wired up by default)
```

`src/arcgis/capability-interpret.ts`, `src/geometry/transform.ts`, and `src/editing/edit-session.ts` are pure (no
`@arcgis/core` import) so they can be unit tested with small deterministic fixtures instead of a live service;
`src/arcgis/capability-check.ts` and `src/arcgis/object-transform.ts` are the thin orchestration layers that call
the SDK and feed it plain data.

## Get started

```bash
npm install
npm run dev       # start the Vite dev server
npm run typecheck # tsc --noEmit
npm run test      # vitest unit tests (pure config/capability-interpretation logic)
npm run build     # tsc && vite build
```

With no `.env` file, the dev server shows the demo fixture described above — useful for verifying the UI itself
works, but it proves nothing about a real service.

## Configure a real test service

1. Copy `.env.example` to `.env` (git-ignored; never commit real values here).
2. Set `VITE_SCENE_LAYER_URL` (a SceneServer layer REST endpoint) or `VITE_SCENE_LAYER_ITEM_ID` (a portal item id)
   to a **3D Object SceneLayer you are authorized to test against**, ideally one with a disposable feature you can
   safely query/edit. Set `VITE_PORTAL_URL` only if it isn't hosted on ArcGIS Online.
3. Optionally set `VITE_TEST_OBJECT_ID` to that disposable feature's `OBJECTID` to exercise the live mesh-query
   probe (`capabilities.query.supportsReturnMesh` + `queryFeatures({ returnGeometry: true })`).
4. Optionally set `VITE_WEBSCENE_ITEM_ID` to show that scene in the left pane for visual context; this is
   independent of the capability-checked layer.
5. Run `npm run dev`. Click **Run capability check** for the milestone 0 report. The editor panel (milestone 1)
   appears next to it whenever a SceneLayer target is configured, pre-filled with `VITE_TEST_OBJECT_ID` if set:
   enter an object id and click **Select** to inspect it, enter a rotation delta and click **Preview** to see a
   local-only candidate (no service call is made), then **Apply** to persist it via `applyEdits()` (inspected
   per-feature, then confirmed by a fresh requery) or **Cancel** to discard the preview. Only public,
   anonymously-readable layers work today — no OAuth flow is wired into the UI yet. `src/auth/configureOAuth.ts`
   has a placeholder for adding one later.

The report will show:

- Whether the layer's `geometryType` is `"mesh"` (a 3D Object SceneLayer) rather than `"point"` or another shape.
- Whether it has an associated, editable FeatureLayer (`SceneLayer.associatedLayer`), and that layer's
  `capabilities.operations`/`capabilities.editing` flags.
- A best-effort change-tracking signal read from the associated layer's raw service JSON
  (`advancedQueryCapabilities.supportsChangeTracking` / `changeTrackingInfo`), since the typed SDK does not expose
  a single change-tracking capability flag.
- A note that GLB/glTF-binary support (required for web geometry edits per Esri Pro analyzer rule 24165) is not
  exposed as a single capability flag and must be verified in ArcGIS Pro against the source data.
- The result of a live mesh-query probe against your configured test object id, if provided.
- A `blockers` list — persistence work should not proceed until this list is empty against a real service.

## What's not done yet

- No WebMCP tool registration — that's milestone 2. `src/editing/commands.ts`'s `EditorCommands` class is designed
  to be reused as-is by that adapter (select/preview/cancel/apply are already decoupled from the DOM).
- No authentication flow wired into the running app, so only public layers can be checked/edited right now.
- Milestone 1 only ever rotates around the object's **existing** rotation axis (writing `esri3do_rdeg` only); it
  does not let you change the axis, translation, or scale.
- No undo/redo beyond a single pending preview's cancel; once an edit is applied there is no "undo last apply" in
  the UI (you'd need to apply an inverse rotation).

## Packages used

- [`@arcgis/core`](https://www.npmjs.com/package/@arcgis/core)
- [`@arcgis/map-components`](https://www.npmjs.com/package/@arcgis/map-components)
- [`@esri/calcite-components`](https://www.npmjs.com/package/@esri/calcite-components)
- [`vitest`](https://vitest.dev/) for unit tests of pure logic

Scaffolded with:

```bash
npx @arcgis/create -n my-arcgis-app -t vite
```
