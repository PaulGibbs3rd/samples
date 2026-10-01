/**
 * "Application commands" that both the visible UI (`ui/editor-controller.ts`)
 * and, later, the WebMCP adapter (milestone 2) call into — per
 * `docs/architecture.md`: "Neither tool registration nor a language model
 * owns a mutable SDK `Mesh` or calls `SceneLayer.applyEdits()` directly."
 * This module owns the one `FeatureLayer` instance, the `edit-session`
 * transitions, and every SDK call; DOM concerns stay out of it entirely.
 */
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import type { AppConfig } from "../arcgis/config.js";
import {
  applyTransform,
  checkTranslationSupported,
  inspectObject,
  loadAssociatedFeatureLayer,
  requeryTransform,
  type ObjectInspection,
} from "../arcgis/object-transform.js";
import {
  beginApply,
  cancelProposal,
  completeApply,
  createIdleSession,
  failApply,
  proposeRotation,
  proposeScale,
  proposeTranslation,
  selectObject,
  type EditSession,
  type PendingChange,
} from "./edit-session.js";
import type { ObjectTransform } from "../geometry/transform.js";

export interface CommandResult {
  session: EditSession;
  inspection: ObjectInspection | null;
  statusMessage: string;
}

export type CommandListener = (result: CommandResult) => void;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Human-readable summary of the just-confirmed transform, tailored to which kind of edit was applied. */
function describeConfirmedTransform(pendingChange: PendingChange | null, confirmed: ObjectTransform): string {
  switch (pendingChange?.kind) {
    case "translation":
      return `offset is now (${confirmed.tx.toFixed(2)}, ${confirmed.ty.toFixed(2)}, ${confirmed.tz.toFixed(2)}).`;
    case "scale":
      return `scale is now (${confirmed.sx.toFixed(2)}, ${confirmed.sy.toFixed(2)}, ${confirmed.sz.toFixed(2)}).`;
    case "rotation":
    default:
      return `angle is now ${confirmed.rdeg.toFixed(2)}°.`;
  }
}

/**
 * Owns the one shared edit session (and its `FeatureLayer`/inspection
 * state) so the visible UI (`ui/editor-controller.ts`) and the WebMCP
 * adapter (`webmcp/tool-adapter.ts`) operate on exactly the same session
 * rather than two independent copies — per `docs/architecture.md`'s
 * milestone 2 acceptance that "UI still works without WebMCP" and an
 * agent's proposal must show up in the same visible preview a human sees.
 * Call `subscribe()` to be notified of every state change regardless of
 * which caller (UI click or WebMCP tool `execute()`) produced it.
 */
interface LoadedLayers {
  sceneLayer: SceneLayer;
  featureLayer: FeatureLayer;
}

export class EditorCommands {
  private sceneLayer: SceneLayer | null = null;
  private featureLayer: FeatureLayer | null = null;
  private loadingLayers: Promise<LoadedLayers> | null = null;
  private inspection: ObjectInspection | null = null;
  private session: EditSession = createIdleSession();
  private listeners = new Set<CommandListener>();

  constructor(private readonly config: AppConfig) {}

  /** Registers a listener invoked after every command call that may have changed state; returns an unsubscribe function. */
  subscribe(listener: CommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(statusMessage: string): CommandResult {
    const result: CommandResult = { session: this.session, inspection: this.inspection, statusMessage };
    for (const listener of this.listeners) listener(result);
    return result;
  }

  /** Current session/inspection without triggering any SDK call or listener notification. */
  getState(): CommandResult {
    return { session: this.session, inspection: this.inspection, statusMessage: "" };
  }

  getConfig(): AppConfig {
    return this.config;
  }

  isFeatureLayerLoaded(): boolean {
    return this.featureLayer !== null;
  }

  private buildSceneLayer(): SceneLayer {
    if (this.config.sceneLayerUrl) {
      return new SceneLayer({ url: this.config.sceneLayerUrl });
    }
    if (this.config.sceneLayerItemId) {
      return new SceneLayer({
        portalItem: {
          id: this.config.sceneLayerItemId,
          ...(this.config.portalUrl ? { portal: { url: this.config.portalUrl } } : {}),
        },
      });
    }
    throw new Error("No SceneLayer configured (set VITE_SCENE_LAYER_URL or VITE_SCENE_LAYER_ITEM_ID).");
  }

  /**
   * Loads (once) and caches both the `SceneLayer` and its associated
   * `FeatureLayer` as a single shared pair, so the exact instance used for
   * `applyEdits()` (via `getFeatureLayer()`) is also the one rendered in the
   * visible 3D view (via `getDisplaySceneLayer()`, added by `scene-render.ts`).
   */
  private getLayers(): Promise<LoadedLayers> {
    if (this.sceneLayer && this.featureLayer) {
      return Promise.resolve({ sceneLayer: this.sceneLayer, featureLayer: this.featureLayer });
    }
    if (this.loadingLayers) return this.loadingLayers;
    const sceneLayer = this.buildSceneLayer();
    this.loadingLayers = loadAssociatedFeatureLayer(sceneLayer).then((featureLayer) => {
      this.sceneLayer = sceneLayer;
      this.featureLayer = featureLayer;
      return { sceneLayer, featureLayer };
    });
    return this.loadingLayers;
  }

  private getFeatureLayer(): Promise<FeatureLayer> {
    return this.getLayers().then(({ featureLayer }) => featureLayer);
  }

  /** The same `SceneLayer` instance used for editing, for `scene-render.ts` to add to the visible 3D view. */
  getDisplaySceneLayer(): Promise<SceneLayer> {
    return this.getLayers().then(({ sceneLayer }) => sceneLayer);
  }

  /** Reads the object's current transform/attributes and starts a fresh edit session for it. */
  async selectObject(objectId: number): Promise<CommandResult> {
    try {
      const layer = await this.getFeatureLayer();
      this.inspection = await inspectObject(layer, objectId);
      this.session = selectObject(this.inspection.selected, this.inspection.transform);
      return this.emit(`Selected object ${objectId}.`);
    } catch (err) {
      return this.emit(`Selection failed: ${describeError(err)}`);
    }
  }

  /** Computes a local-only preview candidate; no service call is made. */
  previewRotation(deltaDegrees: number): CommandResult {
    try {
      this.session = proposeRotation(this.session, deltaDegrees);
      return this.emit("Preview only — no service edit has been made yet.");
    } catch (err) {
      return this.emit(`Preview failed: ${describeError(err)}`);
    }
  }

  /**
   * Computes a local-only translation preview candidate; no service call is
   * made. Milestone 3's spatial-reference/unit check runs first — `tx/ty/tz`
   * are expressed in the associated FeatureLayer's spatial reference linear
   * units, so translation is rejected up front on a geographic (degree-based)
   * spatial reference rather than silently applying the delta in the wrong
   * units.
   */
  async previewTranslation(dx: number, dy: number, dz: number): Promise<CommandResult> {
    try {
      const featureLayer = await this.getFeatureLayer();
      const unsupportedReason = checkTranslationSupported(featureLayer);
      if (unsupportedReason) {
        return this.emit(`Preview failed: ${unsupportedReason}`);
      }
      this.session = proposeTranslation(this.session, dx, dy, dz);
      return this.emit("Preview only — no service edit has been made yet.");
    } catch (err) {
      return this.emit(`Preview failed: ${describeError(err)}`);
    }
  }

  /** Computes a local-only scale preview candidate (uniform factor across sx/sy/sz); no service call is made. */
  previewScale(factor: number): CommandResult {
    try {
      this.session = proposeScale(this.session, factor);
      return this.emit("Preview only — no service edit has been made yet.");
    } catch (err) {
      return this.emit(`Preview failed: ${describeError(err)}`);
    }
  }

  /** Discards the pending preview candidate; the original remains authoritative. */
  discardProposal(): CommandResult {
    try {
      this.session = cancelProposal(this.session);
      return this.emit("Preview discarded; original value restored.");
    } catch (err) {
      return this.emit(`Discard failed: ${describeError(err)}`);
    }
  }

  /**
   * Applies the pending preview via `applyEdits()`, inspects the per-feature
   * result, and — only on success — requeries the service directly (bypassing
   * any client cache) to confirm the value actually persisted before marking
   * the session `applied`.
   */
  async applyProposal(): Promise<CommandResult> {
    const session = this.session;
    if (session.status !== "previewing" || !session.candidate || !session.selected || !session.original) {
      return this.emit("Nothing to apply — preview an edit first.");
    }
    const objectId = session.selected.objectId;
    const candidate = session.candidate;
    const original = session.original;
    const pendingChange = session.pendingChange;
    this.session = beginApply(session);
    this.emit("Applying edit…");

    try {
      const layer = await this.getFeatureLayer();
      const result = await applyTransform(layer, objectId, original, candidate, session.selected.attributes);
      if (!result.success) {
        this.session = failApply(this.session, result.error ?? "applyEdits reported failure", result);
        return this.emit("Apply failed — original value kept.");
      }

      const confirmed = await requeryTransform(layer, objectId);
      this.session = completeApply(this.session, confirmed, result);
      this.inspection = this.inspection ? { ...this.inspection, transform: confirmed } : this.inspection;
      return this.emit(`Applied and confirmed by requery: ${describeConfirmedTransform(pendingChange, confirmed)}`);
    } catch (err) {
      this.session = failApply(this.session, describeError(err), null);
      return this.emit("Apply failed — original value kept.");
    }
  }
}

export { createIdleSession };
export type { EditSession };
