# ArcGIS AI 3D Editor — browser 3D editing proof of concept

TypeScript browser app scaffolded with [`@arcgis/create`](https://www.npmjs.com/package/@arcgis/create) (Vite +
ArcGIS Maps SDK for JavaScript template). See [`docs/architecture.md`](./docs/architecture.md) for the full design
and milestone plan, and [`AGENTS.md`](./AGENTS.md) for the agent workflow.

## Status: milestone 3 — translation and scaling with spatial reference/unit checks

Milestone 0's capability report, milestone 1's rotate/preview/apply/cancel editor, milestone 2's WebMCP tool
surface, and milestone 3's translation/scale editing are all implemented and live-verified end-to-end against a
real enterprise test service. A live 3D `<arcgis-scene>` view and a rotating "ghost" preview mesh (see "Visual
rotation demo" below) were added on top of this so the rotation itself can be seen, not just read from attribute
tables. See "Data and editing prerequisites" and the milestone plan in `docs/architecture.md`.

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

### Milestone 2 findings

- Per `docs/architecture.md`'s WebMCP surface table, exactly five tools are registered in `src/webmcp/tool-adapter.ts`:
  `get_scene`, `get_selection`, `inspect_selected_object`, `propose_rotation`, `discard_proposal`. `apply_proposal`
  is intentionally **not** registered — persistence stays behind the app's own visible Apply button (the human
  approval gate), and a WebMCP tool call must never be treated as that approval.
  - `readOnlyHint: true` on the three read tools; `inspect_selected_object` also sets `untrustedContentHint: true`
    since it surfaces service-sourced attributes. `propose_rotation`/`discard_proposal` set `consequentialHint:
    false` since neither writes to the service.
- **Refactored `EditorCommands` to own the shared edit session** (`src/editing/commands.ts`) with a
  `subscribe()`/`emit()` pub-sub mechanism, and changed `mountEditor()` (`src/ui/editor-controller.ts`) to accept
  an already-constructed `EditorCommands` instance rather than building its own. This was necessary so a WebMCP
  tool call and a human's button click operate on **exactly one** session — otherwise an agent's
  `propose_rotation` call would not show up in the human-visible preview. `main.ts` now constructs one
  `EditorCommands` instance and passes it to both `mountEditor()` and `registerWebMcpTools()`.
- **Pure summaries** (`src/webmcp/summaries.ts`, unit tested) filter tool output down to small, curated
  JSON-serializable objects — `esri3do_*` transform fields, footprint extent, session status/angles — rather
  than returning raw query attributes, per architecture.md's "treat layer names, attributes, and other service
  content as untrusted input when surfaced to an agent."
- **No official TypeScript types exist yet** for Chrome's WebMCP imperative API (`document.modelContext`); hand-
  written ambient declarations live in `src/webmcp/types.ts`. Feature detection (`src/webmcp/feature-detection.ts`)
  guards registration so the app works identically with or without a WebMCP-capable browser.
- **Live-verified with a mocked `document.modelContext`** (no WebMCP-flagged Chrome build was available in this
  environment — see "Known limitation" below): confirmed all five tools register with the correct names/
  annotations, and that calling the mocked `propose_rotation` tool's `execute({ deltaDegrees: 42 })` after
  selecting object 1 through the visible UI produced the same "Preview only — not saved: 42.00°" preview a human
  would see, enabled Apply/Cancel, and made **no service write** (confirmed no REST query changes occurred).
  `discard_proposal` correctly reverted it. Separately, the real end-to-end select → preview → apply → requery
  flow was re-verified live against `SeattleCube_3DObject` (`OBJECTID=1`) after the `EditorCommands` refactor, and
  the feature was reset back to `esri3do_rdeg = 0.0` afterward.
- **Known limitation:** milestone 2's acceptance criterion "a compatible agent discovers tools and proposes a
  rotation" has only been verified against a manually mocked `document.modelContext` in Playwright's Chromium,
  which does not itself implement the WebMCP API. No WebMCP-enabled browser/agent host was available in this
  environment to verify true end-to-end discovery and invocation by a real agent. The tool registration code,
  shared-state wiring, and tool `execute()` behavior are verified; genuine agent discovery is not.

### Milestone 3 findings

- **Extended the rotation-only editor to translation and scale** following the exact same pattern: pure math
  mutators (`translateBy()`/`scaleBy()` in `src/geometry/transform.ts`), session proposals (`proposeTranslation()`/
  `proposeScale()` in `src/editing/edit-session.ts`), SDK-facing apply/checks (`src/arcgis/object-transform.ts`),
  command orchestration (`src/editing/commands.ts`), UI sections (`src/ui/editor-view.ts` +
  `src/ui/editor-controller.ts`), and two new WebMCP tools (`propose_translation`/`propose_scale` in
  `src/webmcp/tool-adapter.ts`) — no `apply_translation`/`apply_scale` tools exist, for the same human-approval-
  gate reason `apply_proposal` doesn't exist for rotation.
- **UX scope decisions:** translation is a 3-axis delta input (`dx`, `dy`, `dz`, expressed in the FeatureLayer's
  spatial reference linear units) rather than absolute target coordinates, mirroring rotation's delta-based UX.
  Scale is a single uniform factor that multiplies `sx`/`sy`/`sz` equally, rather than three independent axis
  inputs — chosen for demo simplicity since non-uniform scale isn't a milestone 3 requirement.
- **Validation:** both translation and scale reject non-finite (`NaN`/`Infinity`) inputs; scale additionally
  rejects zero or negative factors as a degenerate edit. Translation additionally checks the FeatureLayer's
  `spatialReference.isGeographic` (`checkTranslationSupported()`) and refuses to propose a translation against a
  geographic (degree-based) spatial reference, since a linear-unit delta is meaningless there — this mirrors
  architecture.md's "spatial reference/unit checks" acceptance criterion. `SeattleCube_3DObject` uses a projected
  spatial reference (Web Mercator, wkid 102100), so this check passes silently for it; the rejection path itself
  is unit-tested rather than live-verified, since no geographic-SR test service was available.
- **Generalized `applyRotation()` into a diff-based `applyTransform()`:** rather than each edit "kind" writing a
  fixed field set, `applyTransform()` compares `session.original` against `session.candidate` across all seven
  mutable transform fields (`tx/ty/tz`, `sx/sy/sz`, `rdeg`) and writes only whichever fields actually differ. This
  removes the need for `commands.ts` to branch on which kind of edit was proposed, and naturally supports any
  future combined edit (e.g. rotate-and-translate in one apply) without further changes to the apply path.
- **Generalized `EditSession.pendingDeltaDegrees: number | null`** into a discriminated union
  `PendingChange = {kind:"rotation", deltaDegrees} | {kind:"translation", dx, dy, dz} | {kind:"scale", factor}` so
  the UI and WebMCP summaries can render the correct preview text (delta degrees vs. offset vs. factor) for
  whichever kind of edit is currently pending.
- **The ghost-preview mesh needed no changes.** `src/arcgis/mesh-preview.ts`'s `applyTransformToMesh()` and
  `src/ui/scene-preview.ts` were already generic over the full `ObjectTransform` (translation, scale, and
  rotation all map onto `MeshTransform` fields — see "Visual rotation demo" below), so translate/scale preview
  and apply automatically render live in the ghost mesh with zero additional code.
- **Live-verified all four milestone 3 acceptance-adjacent flows** against `SeattleCube_3DObject` (`OBJECTID=1`):
  previewing a translation (`dx=1,dy=0,dz=0`) rendered the correct candidate offset and made no service write;
  applying it persisted `esri3do_tx=1.0` (confirmed by requery); previewing and cancelling a scale proposal
  (`factor=1.1`) correctly restored the original `1.00, 1.00, 1.00` scale display; applying a scale of `1.1`
  persisted `esri3do_sx/sy/sz=1.1` (confirmed by requery, and by the rendered footprint extent growing from
  74.18×74.18 to 81.60×81.60 — exactly the expected `74.18 × 1.1`); the apply-success status message correctly
  reports the field(s) that actually changed (e.g. "offset is now (0.00, 0.00, 0.00)." or "scale is now (1.10,
  1.10, 1.10)."), not a generic "angle is now 0°" leftover from the rotation-only version of the message. The test
  object was reset back to its neutral transform (`tx/ty/tz=0`, `sx/sy/sz=1`, `rdeg=0`) after verification.

### Visual rotation demo (ghost preview)

The tabular editor (object attributes + a numeric angle) doesn't show what a rotation actually looks like, so a
live `<arcgis-scene>` (`src/arcgis/scene-render.ts`) renders the real `SceneLayer` alongside a translucent orange
"ghost" `Mesh` graphic (`src/ui/scene-preview.ts`) that appears and rotates live whenever a preview is active,
subscribed to the same `EditorCommands` pub-sub the UI and WebMCP tools already share.

- **No typed SDK method exposes the real glTF asset**, so `src/arcgis/mesh-preview.ts` fetches it directly via
  `query3d?formatOf3DObjects=3D_gltf` (the same endpoint milestone 0 used to confirm GLB/glTF presence), resolves
  the matching asset by `parentGlobalId === feature.globalid`, and hands the result to
  `meshUtils.createFromGLTF()`.
- **glTF buffer URI quirk (live-verified):** the service's glTF asset has a `buffers[0].uri` that is a bare
  relative filename (e.g. `esriGeometryMultiPatch_ESRI3DODERIVED.bin`) which does **not** resolve against the
  hash-based `.../assets/<hash>` URL the glTF itself was fetched from. The actual binary lives at a *different*
  `assetMaps` entry (`assetType: "binary"`, same `parentGlobalId`); `mesh-preview.ts` rewrites the buffer URI to
  that entry's absolute `assetURL` before handing the glTF to the loader (via a rewritten `Blob`/object URL).
- **`SceneLayer.associatedLayer.url` omits the layer index (live-verified):** unlike a `FeatureLayer` constructed
  directly from a `.../FeatureServer/0` url, the `FeatureLayer` the SDK auto-derives from a `SceneLayer`'s
  `associatedLayer` reports `.url` as the bare service root (`.../FeatureServer`, no `/0`). Calling `query3d`
  directly against that bare root silently returns an **empty** `assetMaps` array (not an error) instead of the
  real asset list. `mesh-preview.ts`'s `resolveLayerUrl()` appends `featureLayer.layerId` (defaulting to `0`)
  whenever the url's last path segment isn't already numeric.
- **`MeshTransform` maps 1:1 onto the `esri3do_*` attributes** milestone 1 already reads/writes
  (`rotationAngle`↔`esri3do_rdeg`, `rotationAxis`↔`esri3do_rx/ry/rz`, `scale`↔`esri3do_sx/sy/sz`,
  `translation`↔`esri3do_tx/ty/tz`), so the exact same `ObjectTransform` used to persist an edit can be applied
  directly to a `Mesh.transform` (`applyTransformToMesh()`) — no separate rotation math was needed for the ghost.
- **Live-verified against `SeattleCube_3DObject`:** selecting object 1 and clicking Preview shows the ghost mesh
  appear, rotated relative to the real (solid) rendered feature beneath it; changing the angle and previewing
  again updates the ghost's rotation live; Cancel hides the ghost; Apply persists the edit (confirmed by requery,
  same as milestone 1).
- **Scope decision:** the real SceneLayer-rendered feature is intentionally left visible (solid) underneath the
  translucent ghost during preview, rather than attempting to hide/filter it via `SceneLayerView` — the ghost
  overlay alone satisfies "see the rotation," and hiding the live feature would need a riskier, unverified API.
- **Known limitation (rotation/scale): the real feature's rendering does not visually update after Apply.** 3D
  Object SceneLayers serve pre-tiled scene-cache nodes from the server; editing the `esri3do_*` attributes
  (confirmed correct via requery) does not itself invalidate or regenerate those cached tiles client-side, and no
  client-callable `refresh()`/cache-rebuild method is exposed on `SceneLayer` in this SDK version. The underlying
  cached scene geometry only reflects an edit after the service's scene cache is rebuilt server-side (out of scope
  here). **Translation is the exception** — see the `viewing-mode="local"` finding below, which does visually
  move the real feature (as a flat footprint placeholder) after Apply.
- **Workaround: the ghost stays visible after a successful Apply, in a distinct color.** Since the real feature
  can't be made to visually update, `scene-preview.ts`'s `syncGhost()` no longer hides the ghost once
  `session.status` leaves `"previewing"`. Instead, once an edit is applied and confirmed by requery, the ghost is
  kept on screen showing `session.original` (the persisted transform) using a teal/more-opaque `APPLIED_SYMBOL`,
  distinct from the amber/translucent `PREVIEW_SYMBOL` used for a pending, unconfirmed preview. This is what lets
  a human visually confirm "the edit took effect" without a server-side cache rebuild. The ghost is cleared again
  only when a different object is selected (or the session returns to a genuinely unedited "selected" state).
- **Revisited and corrected for translation (live-verified):** an earlier pass tested only a 60° *rotation* with
  `<arcgis-scene viewing-mode="local">` active, saw zero visual change, and concluded the `I3SOverrides
  unsupported-pcs-edits-in-global-view` console warning (which suggests "changing the viewing mode to display
  edits") was a red herring. Re-testing specifically for **translation** shows that conclusion was incomplete:
  with `viewing-mode="local"` set, applying a translation (confirmed by requery) now visually moves the real
  feature to its new location — verified with a full hard page reload (no client cache) showing the feature
  rendered at the translated coordinates, not the original ones. The FeatureServer's stored 2D polygon geometry
  tracks `esri3do_ox/oy + esri3do_tx/ty` automatically (`ox=-13619861.77, tx=100` → ring x-centroid
  `-13619761.77`, and likewise for `oy`/`ty`), and the SDK's local-mode I3SOverrides renders that updated
  footprint directly — something it refuses to do in the default `global` viewing mode for a projected spatial
  reference (wkid 102100) layer. Rotation (`esri3do_rdeg/rx/ry/rz`) still shows no visual change either way,
  since it doesn't affect the 2D footprint the override draws from.
- **Trade-offs of keeping `viewing-mode="local"` enabled (live-verified, accepted for this POC):** this feature's
  asset type is `esri3do_type: "3D_shapebuffer"` (a simplified box proxy, not a detailed mesh); in local mode the
  SDK's edit overlay renders it as a **flat, ground-draped 2D polygon with no height** — the box shape visible in
  `global` mode is lost, for this feature, whenever local mode is active (not just while it's offset from
  neutral). Additionally, the ghost-preview mesh (`src/ui/scene-preview.ts` / `src/arcgis/mesh-preview.ts`) no
  longer renders at all in local mode (console warning: `Displaying a mesh with a local vertex space in a view in
  local viewing mode is not supported`), so there's no live preview overlay before Apply — only the apply-time
  success message and the (now-moving) real feature confirm the edit. `index.html` sets `viewing-mode="local"` on
  `<arcgis-scene>` to prioritize the real feature visually moving after Apply over preview/visual fidelity.

## Project layout

```text
src/
  arcgis/   scene/layer loading and capability interpretation (types.ts, config.ts, capability-check.ts,
            capability-interpret.ts, demo-fixture.ts) plus milestone 1's SDK glue (object-transform.ts) and the
            visual-demo's raw glTF fetching/mesh building (mesh-preview.ts) and scene wiring (scene-render.ts)
  ui/       capability-report-view.ts and editor-view.ts render report/editor state into the DOM;
            editor-controller.ts wires DOM events to EditorCommands (no @arcgis/core imports); scene-preview.ts
            owns the ghost preview graphic's lifecycle
  editing/  milestone 1's pure edit-session state machine (edit-session.ts) and the shared
            EditorCommands class (commands.ts) that owns the FeatureLayer + every SDK call
  geometry/ pure rotation/transform math (transform.ts) — no @arcgis/core import, fully unit tested
  webmcp/   milestone 2's WebMCP tool registration: types.ts (ambient document.modelContext types),
            feature-detection.ts, summaries.ts (pure tool-result summaries), tool-adapter.ts (registerWebMcpTools)
  auth/     optional OAuth helper for secured portals (not wired up by default)
```

`src/arcgis/capability-interpret.ts`, `src/geometry/transform.ts`, `src/editing/edit-session.ts`, and
`src/webmcp/summaries.ts` are pure (no `@arcgis/core` import) so they can be unit tested with small deterministic
fixtures instead of a live service; `src/arcgis/capability-check.ts` and `src/arcgis/object-transform.ts` are the
thin orchestration layers that call the SDK and feed it plain data.

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

- No authentication flow wired into the running app, so only public layers can be checked/edited right now.
- Scale is uniform-factor only (`sx = sy = sz`); there is no UI/tool for independent per-axis scale.
- Rotation only ever rotates around the object's **existing** rotation axis (writing `esri3do_rdeg` only); it
  does not let you change the axis itself.
- No undo/redo beyond a single pending preview's cancel; once an edit is applied there is no "undo last apply" in
  the UI (you'd need to apply an inverse edit).
- The real SceneLayer-rendered feature does not visually update after an apply (server-side scene cache rebuild
  is required); see "Visual rotation demo" above for the ghost-preview workaround and why a client-side fix isn't
  possible in this SDK version.

## Packages used

- [`@arcgis/core`](https://www.npmjs.com/package/@arcgis/core)
- [`@arcgis/map-components`](https://www.npmjs.com/package/@arcgis/map-components)
- [`@esri/calcite-components`](https://www.npmjs.com/package/@esri/calcite-components)
- [`vitest`](https://vitest.dev/) for unit tests of pure logic

Scaffolded with:

```bash
npx @arcgis/create -n my-arcgis-app -t vite
```
