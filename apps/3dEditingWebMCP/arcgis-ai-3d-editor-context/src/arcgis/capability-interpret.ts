/**
 * Pure interpretation of raw ArcGIS capability objects into the report types
 * in `types.ts`. No `@arcgis/core` imports here on purpose: these functions
 * take plain data (the shape of `layer.capabilities` / `layer.sourceJSON`)
 * so they can be unit tested with small deterministic fixtures instead of a
 * live service or the full SDK.
 */
import type { CapabilitySupport, FeatureLayerCapabilitySummary, SceneLayerCapabilitySummary } from "./types.js";

/** Matches the shape of `SceneLayer.capabilities` / `FeatureLayer.capabilities`. */
export interface RawLayerCapabilities {
  operations?: {
    supportsAdd?: boolean;
    supportsDelete?: boolean;
    supportsEditing?: boolean;
    supportsUpdate?: boolean;
    supportsQuery?: boolean;
  } | null;
  editing?: {
    supportsGeometryUpdate?: boolean;
  } | null;
  query?: {
    supportsReturnMesh?: boolean;
  } | null;
}

/** Best-effort shape of the raw REST service JSON, used for fields the typed SDK does not expose. */
export interface RawServiceJson {
  changeTrackingInfo?: unknown;
  advancedQueryCapabilities?: {
    supportsChangeTracking?: boolean;
  } | null;
}

function toSupport(value: boolean | undefined): CapabilitySupport {
  return typeof value === "boolean" ? value : "unknown";
}

export interface SceneLayerCapabilityInput {
  title: string | null;
  sourceUrl: string | null;
  geometryType: string | null;
  capabilities: RawLayerCapabilities | null | undefined;
}

export function interpretSceneLayerCapabilities(input: SceneLayerCapabilityInput): SceneLayerCapabilitySummary {
  const operations = input.capabilities?.operations ?? null;
  const editing = input.capabilities?.editing ?? null;
  const query = input.capabilities?.query ?? null;

  return {
    title: input.title,
    sourceUrl: input.sourceUrl,
    geometryType: input.geometryType,
    isThreeDObjectSceneLayer: input.geometryType === "mesh",
    supportsQuery: toSupport(operations?.supportsQuery),
    supportsReturnMesh: toSupport(query?.supportsReturnMesh),
    supportsEditing: toSupport(operations?.supportsEditing),
    supportsGeometryUpdate: toSupport(editing?.supportsGeometryUpdate),
    supportsAdd: toSupport(operations?.supportsAdd),
    supportsUpdate: toSupport(operations?.supportsUpdate),
    supportsDelete: toSupport(operations?.supportsDelete),
  };
}

export interface FeatureLayerCapabilityInput {
  found: boolean;
  title: string | null;
  sourceUrl: string | null;
  capabilities: RawLayerCapabilities | null | undefined;
  sourceJson: RawServiceJson | null | undefined;
}

const GLB_FORMAT_NOTE =
  "Not exposed as a single SDK capability flag. Verify in ArcGIS Pro that the associated feature class was " +
  "published with the Khronos glTF binary (.glb) format (Add 3D Formats To Multipatch), or check for Pro " +
  "analyzer rule 24165 on the source data before relying on web geometry edits.";

export function interpretFeatureLayerCapabilities(input: FeatureLayerCapabilityInput): FeatureLayerCapabilitySummary {
  if (!input.found) {
    return {
      found: false,
      title: null,
      sourceUrl: null,
      supportsEditing: "unknown",
      supportsGeometryUpdate: "unknown",
      supportsAdd: "unknown",
      supportsUpdate: "unknown",
      supportsDelete: "unknown",
      changeTracking: "unknown",
      glbFormatNote: GLB_FORMAT_NOTE,
    };
  }

  const operations = input.capabilities?.operations ?? null;
  const editing = input.capabilities?.editing ?? null;
  const changeTracking =
    typeof input.sourceJson?.advancedQueryCapabilities?.supportsChangeTracking === "boolean"
      ? input.sourceJson.advancedQueryCapabilities.supportsChangeTracking
      : input.sourceJson?.changeTrackingInfo != null
        ? true
        : "unknown";

  return {
    found: true,
    title: input.title,
    sourceUrl: input.sourceUrl,
    supportsEditing: toSupport(operations?.supportsEditing),
    supportsGeometryUpdate: toSupport(editing?.supportsGeometryUpdate),
    supportsAdd: toSupport(operations?.supportsAdd),
    supportsUpdate: toSupport(operations?.supportsUpdate),
    supportsDelete: toSupport(operations?.supportsDelete),
    changeTracking,
    glbFormatNote: GLB_FORMAT_NOTE,
  };
}
