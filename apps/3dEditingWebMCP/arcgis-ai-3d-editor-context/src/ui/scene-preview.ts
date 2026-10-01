/**
 * Owns the live-rotating "ghost" preview graphic for the demo scene: a
 * translucent proxy `Mesh` (built from the object's raw glTF asset — see
 * `arcgis/mesh-preview.ts`) that visually rotates to the session's pending
 * preview candidate, without waiting for Apply. Subscribes to the same
 * `EditorCommands` pub-sub the visible editor panel and WebMCP tools use
 * (`docs/architecture.md`), so both a human's angle input and an agent's
 * `propose_rotation` tool call animate the same ghost.
 *
 * The real SceneLayer-rendered object is left visible underneath the ghost
 * (not hidden/filtered out) — the translucent ghost overlay is enough to see
 * "candidate vs. persisted" side by side without the added risk of a 3D
 * Object SceneLayerView feature-effect API that milestone 0 never verified.
 *
 * 3D Object SceneLayers serve pre-baked, server-side scene-cache geometry
 * that does not regenerate when `esri3do_*` attributes change (see
 * README.md's "known limitation"), so the real rendered feature stays
 * visually unchanged after a confirmed Apply. To still let a human *see*
 * the edit took effect, the ghost is kept on screen after a successful
 * Apply too — using a distinct "confirmed" symbol — instead of being
 * hidden once `session.status` leaves `"previewing"`.
 */
import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import type Mesh from "@arcgis/core/geometry/Mesh.js";
import MeshSymbol3D from "@arcgis/core/symbols/MeshSymbol3D.js";

import { getAssociatedFeatureLayer } from "../arcgis/object-transform.js";
import { applyTransformToMesh, loadRawMesh } from "../arcgis/mesh-preview.js";
import type { EditSession } from "../editing/edit-session.js";
import type { EditorCommands } from "../editing/commands.js";
import type { ObjectTransform } from "../geometry/transform.js";

/** Pending, unconfirmed preview candidate — amber/translucent. */
const PREVIEW_SYMBOL = new MeshSymbol3D({
  symbolLayers: [{ type: "fill", material: { color: [255, 140, 0, 0.45] } }],
});

/**
 * Service-confirmed, applied transform — teal/more opaque, standing in for
 * the real feature's geometry until the SceneLayer's server-side cache is
 * rebuilt (outside this app's scope).
 */
const APPLIED_SYMBOL = new MeshSymbol3D({
  symbolLayers: [{ type: "fill", material: { color: [0, 168, 150, 0.7] } }],
});

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readNumber(attributes: Record<string, unknown>, field: string): number {
  const value = attributes[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Mounts the ghost preview logic and returns the `GraphicsLayer` to add to
 * the scene's `Map` (see `arcgis/scene-render.ts`). `onError` is called with
 * a human-readable message whenever the ghost mesh fails to load (e.g. no
 * completed glTF asset yet) — the rest of the editor keeps working either way,
 * since the ghost is a visual bonus, not required for select/preview/apply.
 */
export function mountScenePreview(commands: EditorCommands, onError?: (message: string) => void): GraphicsLayer {
  const graphicsLayer = new GraphicsLayer({ title: "Rotation preview (ghost)", listMode: "hide" });

  let currentObjectId: number | null = null;
  let baseMesh: Mesh | null = null;
  let ghostGraphic: Graphic | null = null;
  let loadToken = 0;

  function hideGhost(): void {
    if (ghostGraphic) {
      graphicsLayer.remove(ghostGraphic);
      ghostGraphic = null;
    }
  }

  function showGhost(transform: ObjectTransform, symbol: MeshSymbol3D): void {
    if (!baseMesh) return;
    const mesh = baseMesh.clone();
    applyTransformToMesh(mesh, transform);
    if (ghostGraphic) {
      ghostGraphic.geometry = mesh;
      ghostGraphic.symbol = symbol;
    } else {
      ghostGraphic = new Graphic({ geometry: mesh, symbol });
      graphicsLayer.add(ghostGraphic);
    }
  }

  /**
   * Decides what (if anything) the ghost should show for the current
   * session. A pending preview always wins (amber, unconfirmed). Once a
   * preview has been applied and confirmed by requery, the ghost keeps
   * showing `session.original` (now the persisted transform) in a distinct
   * "confirmed" color — standing in for the real feature's geometry, which
   * cannot be made to visually update client-side (see module doc comment).
   * The ghost only disappears once a different object is selected or the
   * session returns to a genuinely unedited "selected" state.
   */
  function syncGhost(session: EditSession): void {
    const sameObject = baseMesh && session.selected?.objectId === currentObjectId;
    if (session.status === "previewing" && session.candidate && sameObject) {
      showGhost(session.candidate, PREVIEW_SYMBOL);
    } else if (session.status === "applied" && session.original && sameObject) {
      showGhost(session.original, APPLIED_SYMBOL);
    } else {
      hideGhost();
    }
  }

  async function ensureMeshFor(session: EditSession): Promise<void> {
    const selected = session.selected;
    if (!selected) {
      currentObjectId = null;
      baseMesh = null;
      hideGhost();
      return;
    }
    if (selected.objectId === currentObjectId) return;

    currentObjectId = selected.objectId;
    baseMesh = null;
    hideGhost();
    const token = ++loadToken;

    try {
      const sceneLayer = await commands.getDisplaySceneLayer();
      const featureLayer = getAssociatedFeatureLayer(sceneLayer);
      const globalIdField = featureLayer.globalIdField;
      const globalId = globalIdField ? String(selected.attributes[globalIdField] ?? "") : "";
      if (!globalId) {
        throw new Error("Selected feature has no globalid; cannot resolve its raw glTF asset for the ghost preview.");
      }
      const spatialReference = featureLayer.spatialReference;
      if (!spatialReference) {
        throw new Error("Associated FeatureLayer has no spatialReference yet.");
      }
      const origin = {
        x: readNumber(selected.attributes, "esri3do_ox"),
        y: readNumber(selected.attributes, "esri3do_oy"),
        z: readNumber(selected.attributes, "esri3do_oz"),
      };

      const mesh = await loadRawMesh(featureLayer, selected.objectId, globalId, origin, spatialReference);
      if (token !== loadToken) return; // a newer selection has since started loading
      baseMesh = mesh;
    } catch (err) {
      if (token !== loadToken) return;
      onError?.(`Ghost preview unavailable for object ${selected.objectId}: ${describeError(err)}`);
    }

    syncGhost(commands.getState().session);
  }

  commands.subscribe(({ session }) => {
    syncGhost(session);
    void ensureMeshFor(session);
  });

  return graphicsLayer;
}
