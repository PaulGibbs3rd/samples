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

const GHOST_SYMBOL = new MeshSymbol3D({
  symbolLayers: [{ type: "fill", material: { color: [255, 140, 0, 0.45] } }],
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

  function showGhost(transform: ObjectTransform): void {
    if (!baseMesh) return;
    const mesh = baseMesh.clone();
    applyTransformToMesh(mesh, transform);
    if (ghostGraphic) {
      ghostGraphic.geometry = mesh;
    } else {
      ghostGraphic = new Graphic({ geometry: mesh, symbol: GHOST_SYMBOL });
      graphicsLayer.add(ghostGraphic);
    }
  }

  function syncGhost(session: EditSession): void {
    if (
      session.status === "previewing" &&
      session.candidate &&
      baseMesh &&
      session.selected?.objectId === currentObjectId
    ) {
      showGhost(session.candidate);
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
