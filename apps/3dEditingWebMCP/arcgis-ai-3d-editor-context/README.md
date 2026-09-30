# ArcGIS AI 3D Editor — browser 3D editing proof of concept

TypeScript browser app scaffolded with [`@arcgis/create`](https://www.npmjs.com/package/@arcgis/create) (Vite +
ArcGIS Maps SDK for JavaScript template). See [`docs/architecture.md`](./docs/architecture.md) for the full design
and milestone plan, and [`AGENTS.md`](./AGENTS.md) for the agent workflow.

## Status: milestone 0 — capability check

Milestone 0's deliverable is a capability report, **not** a working editor yet: given a configured 3D Object
SceneLayer, it loads the layer and its associated FeatureLayer and reports real editing, mesh-query, and
change-tracking capabilities (see "Data and editing prerequisites" in `docs/architecture.md`). Milestone 1 (the
rotate/preview/apply vertical slice) has not been implemented — do it only once a capability report from a real
test service shows editing is actually possible.

**No credentials or real service URLs are committed to this repository** — `.env` is git-ignored. Running the
app without a local `.env` shows an explicit demo fixture, clearly labeled as such. See
[Configure a real test service](#configure-a-real-test-service) below for how to point it at one.

The live check has been run once against a real (anonymously-readable) enterprise test item —
`SeattleCube_3DObject`, a single disposable cube published as a 3D Object SceneLayer + associated FeatureLayer.
Findings from that run:

- It correctly identifies `geometryType: "mesh"` and resolves the associated FeatureLayer.
- **Update (after enabling editing on the service):** the associated FeatureLayer now reports
  `capabilities: Query,Create,Update,Delete,Uploads,Editing,ChangeTracking` and `allowGeometryUpdates: true`, and
  the live report shows `supportsEditing`/`supportsAdd`/`supportsUpdate`/`supportsDelete` all `true` on both the
  SceneLayer and the associated FeatureLayer. This test item is now a viable target for validating milestone 1.
- **GLB/glTF format confirmed present** (previously "unverified"): inspecting the associated FeatureLayer's
  `query3d` response directly shows an `assetMaps` entry with `assetType: "3D_gltf"`,
  `conversionStatus: "COMPLETED"`, and a working, anonymously-fetchable `assetURL` — i.e. the Khronos glTF binary
  format required for web editing (Pro analyzer rule 24165) is present for this test feature.
- **Open issue found while digging into the "no mesh returned" blocker:** `SceneLayer.queryFeatures({ objectIds,
  returnGeometry: true })` still returns a feature with `geometry: null` for this item, even though
  `supportsReturnMesh` is `true` and the glTF asset above is confirmed valid and reachable. Captured network
  traffic shows the SDK's own query goes through `FeatureServer/0/query3d?formatOf3DObjects=3D_gltf`, which
  returns only an envelope (bounding box) plus the transform attributes (`esri3do_tx/ty/tz`, `esri3do_rx/ry/rz/
  rdeg`, `esri3do_sx/sy/sz`) and the asset map — it never fetches the glTF asset itself, so no `Mesh` is
  constructed from a bare `queryFeatures()` call. The newer `SceneLayer.queryModels()`/`queryModel()` API (added
  in more recent SDK versions specifically for 3D Object model retrieval) looks like the right tool to investigate
  next, rather than assuming `queryFeatures()` alone is sufficient for milestone 1's mesh-read step.

## Project layout

```text
src/
  arcgis/   scene/layer loading and capability interpretation (types.ts, config.ts, capability-check.ts,
            capability-interpret.ts, demo-fixture.ts)
  ui/       capability-report-view.ts renders a CapabilityReport into the DOM
  editing/  reserved for milestone 1 (edit session, preview, validation, persistence)
  geometry/ reserved for milestone 1+ (transforms, dimension summaries)
  webmcp/   reserved for milestone 2 (WebMCP tool registration)
  auth/     optional OAuth helper for secured portals (not wired up by default)
```

`src/arcgis/capability-interpret.ts` is pure (no `@arcgis/core` import) so it can be unit tested with small
deterministic fixtures instead of a live service; `src/arcgis/capability-check.ts` is the thin orchestration layer
that calls the SDK and feeds it plain data.

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
5. Run `npm run dev` and click **Run capability check**. Only public, anonymously-readable layers work today — no
   OAuth flow is wired into the UI yet. `src/auth/configureOAuth.ts` has a placeholder for adding one later.

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

- No editor UI (selection, rotate, preview, apply/cancel) — that's milestone 1.
- No WebMCP tool registration — that's milestone 2.
- No authentication flow wired into the running app, so only public layers can be checked right now.
- `applyEdits()` itself has not been called yet; this repository does not claim edits actually persist against
  `SeattleCube_3DObject` even though its capabilities now report editing is enabled.
- `SceneLayer.queryFeatures({ returnGeometry: true })` still doesn't return a `Mesh` for `SeattleCube_3DObject`'s
  one feature, despite a confirmed, valid, reachable glTF asset — see the investigation notes above. Milestone 1
  should try `SceneLayer.queryModels()`/`queryModel()` instead of assuming `queryFeatures()` is the right mesh-read
  API before building the rotate/preview/apply flow on top of it.

## Packages used

- [`@arcgis/core`](https://www.npmjs.com/package/@arcgis/core)
- [`@arcgis/map-components`](https://www.npmjs.com/package/@arcgis/map-components)
- [`@esri/calcite-components`](https://www.npmjs.com/package/@esri/calcite-components)
- [`vitest`](https://vitest.dev/) for unit tests of pure logic

Scaffolded with:

```bash
npx @arcgis/create -n my-arcgis-app -t vite
```
