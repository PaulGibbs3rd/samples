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
  applyRotation,
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
  selectObject,
  type EditSession,
} from "./edit-session.js";

export interface CommandResult {
  session: EditSession;
  inspection: ObjectInspection | null;
  statusMessage: string;
}

export class EditorCommands {
  private featureLayer: FeatureLayer | null = null;
  private loadingLayer: Promise<FeatureLayer> | null = null;
  private inspection: ObjectInspection | null = null;

  constructor(private readonly config: AppConfig) {}

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

  private getFeatureLayer(): Promise<FeatureLayer> {
    if (this.featureLayer) return Promise.resolve(this.featureLayer);
    if (this.loadingLayer) return this.loadingLayer;
    this.loadingLayer = loadAssociatedFeatureLayer(this.buildSceneLayer()).then((layer) => {
      this.featureLayer = layer;
      return layer;
    });
    return this.loadingLayer;
  }

  /** Reads the object's current transform/attributes and starts a fresh edit session for it. */
  async selectObject(objectId: number): Promise<CommandResult> {
    const layer = await this.getFeatureLayer();
    this.inspection = await inspectObject(layer, objectId);
    const next = selectObject(this.inspection.selected, this.inspection.transform);
    return { session: next, inspection: this.inspection, statusMessage: `Selected object ${objectId}.` };
  }

  /** Computes a local-only preview candidate; no service call is made. */
  previewRotation(session: EditSession, deltaDegrees: number): CommandResult {
    const next = proposeRotation(session, deltaDegrees);
    return {
      session: next,
      inspection: this.inspection,
      statusMessage: "Preview only — no service edit has been made yet.",
    };
  }

  /** Discards the pending preview candidate; the original remains authoritative. */
  discardProposal(session: EditSession): CommandResult {
    const next = cancelProposal(session);
    return { session: next, inspection: this.inspection, statusMessage: "Preview discarded; original value restored." };
  }

  /**
   * Applies the pending preview via `applyEdits()`, inspects the per-feature
   * result, and — only on success — requeries the service directly (bypassing
   * any client cache) to confirm the value actually persisted before marking
   * the session `applied`.
   */
  async applyProposal(session: EditSession): Promise<CommandResult> {
    if (session.status !== "previewing" || !session.candidate || !session.selected) {
      return { session, inspection: this.inspection, statusMessage: "Nothing to apply — preview a rotation first." };
    }
    const objectId = session.selected.objectId;
    const candidate = session.candidate;
    let applying = beginApply(session);

    const layer = await this.getFeatureLayer();
    const result = await applyRotation(layer, objectId, candidate, session.selected.attributes);
    if (!result.success) {
      applying = failApply(applying, result.error ?? "applyEdits reported failure", result);
      return { session: applying, inspection: this.inspection, statusMessage: "Apply failed — original value kept." };
    }

    const confirmed = await requeryTransform(layer, objectId);
    applying = completeApply(applying, confirmed, result);
    this.inspection = this.inspection ? { ...this.inspection, transform: confirmed } : this.inspection;
    return {
      session: applying,
      inspection: this.inspection,
      statusMessage: `Applied and confirmed by requery: angle is now ${confirmed.rdeg.toFixed(2)}°.`,
    };
  }
}

export { createIdleSession };
export type { EditSession };
