import { describe, expect, it } from "vitest";
import { interpretFeatureLayerCapabilities, interpretSceneLayerCapabilities } from "./capability-interpret.js";

describe("interpretSceneLayerCapabilities", () => {
  it("flags a mesh geometryType as a 3D Object SceneLayer", () => {
    const summary = interpretSceneLayerCapabilities({
      title: "Buildings",
      sourceUrl: "https://example.test/SceneServer/layers/0",
      geometryType: "mesh",
      capabilities: {
        operations: { supportsAdd: true, supportsDelete: false, supportsEditing: true, supportsUpdate: true, supportsQuery: true },
        editing: { supportsGeometryUpdate: true },
        query: { supportsReturnMesh: true },
      },
    });

    expect(summary.isThreeDObjectSceneLayer).toBe(true);
    expect(summary.supportsReturnMesh).toBe(true);
    expect(summary.supportsGeometryUpdate).toBe(true);
    expect(summary.supportsAdd).toBe(true);
    expect(summary.supportsDelete).toBe(false);
  });

  it("flags a non-mesh geometryType as not a 3D Object SceneLayer", () => {
    const summary = interpretSceneLayerCapabilities({
      title: "Trees",
      sourceUrl: "https://example.test/SceneServer/layers/1",
      geometryType: "point",
      capabilities: null,
    });

    expect(summary.isThreeDObjectSceneLayer).toBe(false);
  });

  it("reports unknown when capabilities are missing", () => {
    const summary = interpretSceneLayerCapabilities({
      title: null,
      sourceUrl: null,
      geometryType: null,
      capabilities: undefined,
    });

    expect(summary.supportsQuery).toBe("unknown");
    expect(summary.supportsReturnMesh).toBe("unknown");
    expect(summary.supportsEditing).toBe("unknown");
    expect(summary.supportsGeometryUpdate).toBe("unknown");
  });
});

describe("interpretFeatureLayerCapabilities", () => {
  it("reports found: false with unknown capabilities when there is no associated layer", () => {
    const summary = interpretFeatureLayerCapabilities({
      found: false,
      title: null,
      sourceUrl: null,
      capabilities: null,
      sourceJson: null,
    });

    expect(summary.found).toBe(false);
    expect(summary.supportsEditing).toBe("unknown");
    expect(summary.changeTracking).toBe("unknown");
  });

  it("reads editing capabilities and infers change tracking from advancedQueryCapabilities", () => {
    const summary = interpretFeatureLayerCapabilities({
      found: true,
      title: "Buildings (features)",
      sourceUrl: "https://example.test/FeatureServer/0",
      capabilities: {
        operations: { supportsAdd: false, supportsDelete: false, supportsEditing: true, supportsUpdate: true },
        editing: { supportsGeometryUpdate: true },
      },
      sourceJson: { advancedQueryCapabilities: { supportsChangeTracking: true } },
    });

    expect(summary.found).toBe(true);
    expect(summary.supportsEditing).toBe(true);
    expect(summary.supportsGeometryUpdate).toBe(true);
    expect(summary.changeTracking).toBe(true);
  });

  it("infers change tracking from the presence of changeTrackingInfo when advancedQueryCapabilities is absent", () => {
    const summary = interpretFeatureLayerCapabilities({
      found: true,
      title: null,
      sourceUrl: null,
      capabilities: null,
      sourceJson: { changeTrackingInfo: { lastSyncId: 42 } },
    });

    expect(summary.changeTracking).toBe(true);
  });

  it("always returns a GLB note pointing to manual verification", () => {
    const summary = interpretFeatureLayerCapabilities({
      found: true,
      title: null,
      sourceUrl: null,
      capabilities: null,
      sourceJson: null,
    });

    expect(summary.glbFormatNote.length).toBeGreaterThan(0);
  });
});
