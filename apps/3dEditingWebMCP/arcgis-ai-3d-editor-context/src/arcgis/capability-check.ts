/**
 * Milestone 0 capability check: loads the configured 3D Object SceneLayer
 * and its associated FeatureLayer, then reports real editing / change
 * tracking / mesh-query capabilities against a disposable test feature.
 *
 * This module only orchestrates SDK calls and extracts plain data; the
 * actual capability interpretation lives in the pure, unit-tested
 * `capability-interpret.ts`.
 */
import SceneLayer from "@arcgis/core/layers/SceneLayer.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import type { AppConfig } from "./config.js";
import { interpretFeatureLayerCapabilities, interpretSceneLayerCapabilities } from "./capability-interpret.js";
import type { CapabilityReport, MeshQueryProbe } from "./types.js";
import { TRANSFORM_ANGLE_FIELD } from "./object-transform.js";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildSceneLayer(config: AppConfig): SceneLayer {
  if (config.sceneLayerUrl) {
    return new SceneLayer({ url: config.sceneLayerUrl });
  }
  if (config.sceneLayerItemId) {
    return new SceneLayer({
      portalItem: {
        id: config.sceneLayerItemId,
        ...(config.portalUrl ? { portal: { url: config.portalUrl } } : {}),
      },
    });
  }
  throw new Error("checkSceneLayerCapabilities requires VITE_SCENE_LAYER_URL or VITE_SCENE_LAYER_ITEM_ID to be set");
}

/**
 * Runs the milestone 0 capability check against a configured, live service.
 * Throws only for configuration errors; service/network failures are
 * recorded as blockers on the returned report instead.
 */
export async function checkSceneLayerCapabilities(config: AppConfig): Promise<CapabilityReport> {
  const notes: string[] = [];
  const blockers: string[] = [];

  const sceneLayer = buildSceneLayer(config);
  await sceneLayer.load();

  const geometryType = (sceneLayer as unknown as { geometryType?: string }).geometryType ?? null;
  const sceneSummary = interpretSceneLayerCapabilities({
    title: sceneLayer.title ?? null,
    sourceUrl: sceneLayer.url ?? null,
    geometryType,
    capabilities: sceneLayer.capabilities,
  });

  if (!sceneSummary.isThreeDObjectSceneLayer) {
    blockers.push(
      `Layer geometryType is "${geometryType ?? "unknown"}", not "mesh" (3D Object SceneLayer). ` +
        "Point/IntegratedMesh/PointCloud/BuildingSceneLayer are out of scope for this MVP.",
    );
  }

  let associatedSummary;
  try {
    const associatedLayer = (sceneLayer as unknown as { associatedLayer?: FeatureLayer | null }).associatedLayer;
    if (associatedLayer) {
      await associatedLayer.load();
      associatedSummary = interpretFeatureLayerCapabilities({
        found: true,
        title: associatedLayer.title ?? null,
        sourceUrl: associatedLayer.url ?? null,
        capabilities: associatedLayer.capabilities,
        sourceJson: (associatedLayer as unknown as { sourceJSON?: unknown }).sourceJSON as never,
      });
    } else {
      blockers.push(
        "No associated FeatureLayer found. Geometry edits require a 3D Object SceneLayer published with an " +
          "associated, editable FeatureLayer — see Esri docs on the item-level scene/feature layer relationship.",
      );
      associatedSummary = interpretFeatureLayerCapabilities({
        found: false,
        title: null,
        sourceUrl: null,
        capabilities: null,
        sourceJson: null,
      });
    }
  } catch (err) {
    blockers.push(`Failed to load the associated FeatureLayer: ${describeError(err)}`);
    associatedSummary = interpretFeatureLayerCapabilities({
      found: false,
      title: null,
      sourceUrl: null,
      capabilities: null,
      sourceJson: null,
    });
  }

  const meshQueryProbe: MeshQueryProbe = {
    attempted: false,
    objectId: config.testObjectId,
    success: null,
    hasMesh: null,
    hasTransformAttributes: null,
    error: null,
  };

  if (sceneSummary.supportsReturnMesh !== true) {
    notes.push("capabilities.query.supportsReturnMesh is not true; skipped the live mesh-query probe.");
  } else if (config.testObjectId === null) {
    notes.push(
      "No test object id configured; skipped the live mesh-query probe. Set VITE_TEST_OBJECT_ID to a " +
        "disposable feature's OBJECTID to confirm mesh retrieval.",
    );
  } else {
    meshQueryProbe.attempted = true;
    try {
      // outFields must be non-empty (e.g. "*") or the service never resolves
      // geometry at all — live-verified: outFields: [] returns geometry: null,
      // while outFields: ["*"] returns a Mesh instance (see README).
      const result = await sceneLayer.queryFeatures({
        objectIds: [config.testObjectId],
        returnGeometry: true,
        outFields: ["*"],
      });
      const feature = result.features[0];
      meshQueryProbe.success = Boolean(feature);
      meshQueryProbe.hasMesh = Boolean(feature?.geometry);
      meshQueryProbe.hasTransformAttributes = Boolean(
        feature && typeof feature.attributes?.[TRANSFORM_ANGLE_FIELD] === "number",
      );
      if (!feature) {
        blockers.push(`Test object id ${config.testObjectId} was not returned by queryFeatures; confirm it exists.`);
      } else if (!feature.geometry) {
        blockers.push(`Query for object id ${config.testObjectId} succeeded but returned no mesh geometry.`);
      } else {
        notes.push(
          "3D Object SceneLayer features resolve geometry to an empty placeholder Mesh (0 vertices) over the " +
            "public query API; this is expected, not a blocker. The editable transform lives in the " +
            `esri3do_* attributes (see "hasTransformAttributes" above), not in mesh vertex data.`,
        );
      }
      if (feature && !meshQueryProbe.hasTransformAttributes) {
        blockers.push(
          `Test object id ${config.testObjectId} is missing the ${TRANSFORM_ANGLE_FIELD} attribute; milestone 1's ` +
            "rotation editing needs the esri3do_* transform fields on the associated FeatureLayer.",
        );
      }
    } catch (err) {
      meshQueryProbe.success = false;
      meshQueryProbe.error = describeError(err);
      blockers.push(`Mesh query probe failed: ${meshQueryProbe.error}`);
    }
  }

  return {
    mode: "live",
    generatedAt: new Date().toISOString(),
    scene: sceneSummary,
    associatedFeatureLayer: associatedSummary,
    meshQueryProbe,
    blockers,
    notes,
  };
}
