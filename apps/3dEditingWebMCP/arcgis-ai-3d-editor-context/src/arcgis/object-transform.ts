/**
 * SDK-dependent glue for milestone 1: loads the associated FeatureLayer,
 * reads a feature's `esri3do_*` transform attributes and footprint extent,
 * applies a rotation-only edit via `FeatureLayer.applyEdits()`, and
 * requeries to confirm the persisted value. Kept separate from the pure
 * `geometry/transform.ts` and `editing/edit-session.ts` modules so those
 * stay unit-testable without a live service.
 */
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import Graphic from "@arcgis/core/Graphic.js";

import type { ApplyResult, SelectedObject } from "../editing/edit-session.js";
import type { ObjectTransform } from "../geometry/transform.js";

/** The one attribute milestone 1 ever writes: rotation angle around the object's existing axis. */
export const TRANSFORM_ANGLE_FIELD = "esri3do_rdeg";

const TRANSFORM_FIELDS = [
  "esri3do_tx",
  "esri3do_ty",
  "esri3do_tz",
  "esri3do_sx",
  "esri3do_sy",
  "esri3do_sz",
  "esri3do_rx",
  "esri3do_ry",
  "esri3do_rz",
  TRANSFORM_ANGLE_FIELD,
] as const;

function num(attributes: Record<string, unknown>, field: string, fallback: number): number {
  const value = attributes[field];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Reads the object's transform out of raw query attributes, defaulting any missing field. */
export function transformFromAttributes(attributes: Record<string, unknown>): ObjectTransform {
  return {
    tx: num(attributes, "esri3do_tx", 0),
    ty: num(attributes, "esri3do_ty", 0),
    tz: num(attributes, "esri3do_tz", 0),
    sx: num(attributes, "esri3do_sx", 1),
    sy: num(attributes, "esri3do_sy", 1),
    sz: num(attributes, "esri3do_sz", 1),
    rx: num(attributes, "esri3do_rx", 0),
    ry: num(attributes, "esri3do_ry", 1),
    rz: num(attributes, "esri3do_rz", 0),
    rdeg: num(attributes, TRANSFORM_ANGLE_FIELD, 0),
  };
}

export interface ObjectInspection {
  selected: SelectedObject;
  transform: ObjectTransform;
  /** Footprint extent from the associated FeatureLayer's (2D) geometry, or null if unavailable. */
  footprintExtent: { width: number; height: number; spatialReferenceWkid: number | null } | null;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Reads a (loaded) SceneLayer's associated FeatureLayer, throwing if there isn't one. */
export function getAssociatedFeatureLayer(sceneLayer: SceneLayer): FeatureLayer {
  const associated = (sceneLayer as unknown as { associatedLayer?: FeatureLayer | null }).associatedLayer;
  if (!associated) {
    throw new Error("SceneLayer has no associated FeatureLayer to edit.");
  }
  return associated;
}

/** Loads (if needed) and returns the FeatureLayer associated with a 3D Object SceneLayer. */
export async function loadAssociatedFeatureLayer(sceneLayer: SceneLayer): Promise<FeatureLayer> {
  await sceneLayer.load();
  const associated = getAssociatedFeatureLayer(sceneLayer);
  await associated.load();
  return associated;
}

/**
 * Queries one feature by object id and returns its transform, display
 * attributes, and 2D footprint extent for the inspect panel. Requests
 * `outFields: ["*"]` — live-verified that `outFields: []` makes the service
 * resolve `geometry: null` even when `returnGeometry: true` is set.
 */
export async function inspectObject(featureLayer: FeatureLayer, objectId: number): Promise<ObjectInspection> {
  const result = await featureLayer.queryFeatures({
    objectIds: [objectId],
    returnGeometry: true,
    outFields: ["*"],
  });
  const feature = result.features[0];
  if (!feature) {
    throw new Error(`Object id ${objectId} was not found on ${featureLayer.url ?? "the associated FeatureLayer"}.`);
  }

  const attributes = (feature.attributes ?? {}) as Record<string, unknown>;
  const transform = transformFromAttributes(attributes);

  const extent = feature.geometry?.extent ?? null;
  const footprintExtent = extent
    ? {
        width: Math.abs(extent.xmax - extent.xmin),
        height: Math.abs(extent.ymax - extent.ymin),
        spatialReferenceWkid: extent.spatialReference?.wkid ?? null,
      }
    : null;

  const displayNameField = featureLayer.displayField;
  const displayName =
    (displayNameField && typeof attributes[displayNameField] === "string" && (attributes[displayNameField] as string)) ||
    `Object ${objectId}`;

  return {
    selected: {
      layerUrl: featureLayer.url ?? "",
      objectId,
      displayName,
      attributes,
    },
    transform,
    footprintExtent,
  };
}

/**
 * Applies a rotation-only edit (writes only `esri3do_rdeg`) via
 * `FeatureLayer.applyEdits()`, inspecting the per-feature `updateResults`
 * rather than trusting the resolved promise alone.
 */
export async function applyRotation(
  featureLayer: FeatureLayer,
  objectId: number,
  candidate: ObjectTransform,
  sourceAttributes: Record<string, unknown>,
): Promise<ApplyResult> {
  const appliedAt = new Date().toISOString();
  try {
    // 3D Object FeatureLayers (layers with `infoFor3D`) force `globalIdUsed: true`
    // internally regardless of the `applyEdits()` options argument — live-verified:
    // passing `{ globalIdUsed: false }` did NOT avoid "Feature should have
    // 'globalid' when 'globalIdUsed' is true", because the SDK computes
    // `globalIdUsed = options?.globalIdUsed || (layer.infoFor3D != null)`.
    // So the update graphic must carry the feature's globalid value.
    const globalIdField = featureLayer.globalIdField;
    const attributes: Record<string, unknown> = {
      [featureLayer.objectIdField]: objectId,
      [TRANSFORM_ANGLE_FIELD]: candidate.rdeg,
    };
    if (globalIdField) {
      const globalIdValue = sourceAttributes[globalIdField];
      if (globalIdValue == null) {
        return {
          success: false,
          objectId,
          error: `Feature is missing its '${globalIdField}' value; cannot apply edit on a layer that requires globalIdUsed.`,
          appliedAt,
        };
      }
      attributes[globalIdField] = globalIdValue;
    }

    const editsResult = await featureLayer.applyEdits({
      updateFeatures: [new Graphic({ attributes })],
    });
    const updateResult = editsResult.updateFeatureResults[0];
    if (!updateResult) {
      return { success: false, objectId, error: "applyEdits() returned no per-feature update result.", appliedAt };
    }
    if (updateResult.error) {
      return { success: false, objectId, error: describeError(updateResult.error), appliedAt };
    }
    return { success: true, objectId, error: null, appliedAt };
  } catch (err) {
    return { success: false, objectId, error: describeError(err), appliedAt };
  }
}

/**
 * Requeries the feature straight from the service (bypassing any client
 * cache) to confirm the persisted `esri3do_rdeg` value, per the milestone 1
 * acceptance criterion that apply "survives requery/reload".
 */
export async function requeryTransform(featureLayer: FeatureLayer, objectId: number): Promise<ObjectTransform> {
  const result = await featureLayer.queryFeatures({
    objectIds: [objectId],
    returnGeometry: false,
    outFields: [...TRANSFORM_FIELDS],
  });
  const feature = result.features[0];
  if (!feature) {
    throw new Error(`Requery for object id ${objectId} returned no feature.`);
  }
  return transformFromAttributes((feature.attributes ?? {}) as Record<string, unknown>);
}
