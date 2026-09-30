import { describe, expect, it } from "vitest";
import { summarizeInspection, summarizeScene, summarizeSelection } from "./summaries.js";
import type { AppConfig } from "../arcgis/config.js";
import type { ObjectInspection } from "../arcgis/object-transform.js";
import { createIdleSession, proposeRotation, selectObject, type SelectedObject } from "../editing/edit-session.js";
import type { ObjectTransform } from "../geometry/transform.js";

const CONFIG: AppConfig = {
  portalUrl: "https://portal.test/portal",
  webSceneItemId: null,
  sceneLayerUrl: "https://portal.test/server/rest/services/Hosted/Test/SceneServer",
  sceneLayerItemId: null,
  testObjectId: 1,
};

const TRANSFORM: ObjectTransform = { tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1, rx: 0, ry: 1, rz: 0, rdeg: 30 };
const SELECTED: SelectedObject = {
  layerUrl: "https://portal.test/server/rest/services/Hosted/Test/FeatureServer/0",
  objectId: 1,
  displayName: "Object 1",
  attributes: { objectid: 1, esri3do_rdeg: 30 },
};

describe("summarizeScene", () => {
  it("reports config fields and layer-loaded status without any SDK object", () => {
    const summary = summarizeScene(CONFIG, true);
    expect(summary).toEqual({
      portalUrl: "https://portal.test/portal",
      sceneLayerUrl: "https://portal.test/server/rest/services/Hosted/Test/SceneServer",
      sceneLayerItemId: null,
      featureLayerLoaded: true,
      suggestedTestObjectId: 1,
    });
  });
});

describe("summarizeSelection", () => {
  it("reports idle status with no selection", () => {
    const summary = summarizeSelection(createIdleSession());
    expect(summary.status).toBe("idle");
    expect(summary.objectId).toBeNull();
    expect(summary.pendingPreview).toBeNull();
  });

  it("reports the current angle but no pending preview once selected", () => {
    const session = selectObject(SELECTED, TRANSFORM);
    const summary = summarizeSelection(session);
    expect(summary.status).toBe("selected");
    expect(summary.objectId).toBe(1);
    expect(summary.currentAngleDegrees).toBe(30);
    expect(summary.pendingPreview).toBeNull();
  });

  it("reports a pending preview candidate distinct from the current angle", () => {
    const session = proposeRotation(selectObject(SELECTED, TRANSFORM), 15);
    const summary = summarizeSelection(session);
    expect(summary.status).toBe("previewing");
    expect(summary.currentAngleDegrees).toBe(30);
    expect(summary.pendingPreview).toEqual({ candidateAngleDegrees: 45, deltaDegrees: 15 });
  });
});

describe("summarizeInspection", () => {
  it("exposes only the curated transform/footprint fields, not raw attributes", () => {
    const inspection: ObjectInspection = {
      selected: SELECTED,
      transform: TRANSFORM,
      footprintExtent: { width: 10, height: 20, spatialReferenceWkid: 102100 },
    };
    const summary = summarizeInspection(inspection);
    expect(summary).toEqual({
      objectId: 1,
      displayName: "Object 1",
      footprintExtent: { width: 10, height: 20, spatialReferenceWkid: 102100 },
      rotation: { angleDegrees: 30, axis: { x: 0, y: 1, z: 0 } },
      translation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect(summary).not.toHaveProperty("attributes");
  });
});
