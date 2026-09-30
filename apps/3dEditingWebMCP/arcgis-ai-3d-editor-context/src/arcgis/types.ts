/**
 * Milestone 0 capability-report types.
 *
 * These types intentionally avoid any dependency on `@arcgis/core` so the
 * interpretation logic in `capability-interpret.ts` stays pure and testable
 * with small deterministic fixtures (see `capability-interpret.test.ts`).
 */

/** Tri-state support flag: `"unknown"` when the SDK/service did not report a value. */
export type CapabilitySupport = boolean | "unknown";

export interface SceneLayerCapabilitySummary {
  title: string | null;
  sourceUrl: string | null;
  /** Raw `geometryType` reported by the layer, e.g. `"mesh"` for a 3D Object SceneLayer. */
  geometryType: string | null;
  /** True only when `geometryType === "mesh"`, the shape used by 3D Object SceneLayers. */
  isThreeDObjectSceneLayer: boolean;
  supportsQuery: CapabilitySupport;
  supportsReturnMesh: CapabilitySupport;
  supportsEditing: CapabilitySupport;
  supportsGeometryUpdate: CapabilitySupport;
  supportsAdd: CapabilitySupport;
  supportsUpdate: CapabilitySupport;
  supportsDelete: CapabilitySupport;
}

export interface FeatureLayerCapabilitySummary {
  /** False when the SceneLayer has no associated FeatureLayer at all. */
  found: boolean;
  title: string | null;
  sourceUrl: string | null;
  supportsEditing: CapabilitySupport;
  supportsGeometryUpdate: CapabilitySupport;
  supportsAdd: CapabilitySupport;
  supportsUpdate: CapabilitySupport;
  supportsDelete: CapabilitySupport;
  /** Change tracking is a service-level setting not exposed as a single typed SDK property. */
  changeTracking: CapabilitySupport;
  /** GLB/glTF-binary support cannot be read as one capability flag; see note text for how to verify it. */
  glbFormatNote: string;
}

export interface MeshQueryProbe {
  attempted: boolean;
  objectId: number | null;
  success: boolean | null;
  hasMesh: boolean | null;
  error: string | null;
}

export type CapabilityReportMode = "live" | "demo-fixture" | "not-configured";

export interface CapabilityReport {
  mode: CapabilityReportMode;
  generatedAt: string;
  scene: SceneLayerCapabilitySummary | null;
  associatedFeatureLayer: FeatureLayerCapabilitySummary | null;
  meshQueryProbe: MeshQueryProbe | null;
  /** Findings that block persistence work until a real/authorized test service resolves them. */
  blockers: string[];
  notes: string[];
}
