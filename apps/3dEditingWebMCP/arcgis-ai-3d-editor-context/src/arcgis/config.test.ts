import { describe, expect, it } from "vitest";
import { hasSceneLayerTarget, parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("returns nulls when no env vars are set", () => {
    const config = parseConfig({});
    expect(config.portalUrl).toBeNull();
    expect(config.webSceneItemId).toBeNull();
    expect(config.sceneLayerUrl).toBeNull();
    expect(config.sceneLayerItemId).toBeNull();
    expect(config.testObjectId).toBeNull();
  });

  it("reads and trims string values", () => {
    const config = parseConfig({
      VITE_PORTAL_URL: "  https://example.maps.arcgis.com  ",
      VITE_SCENE_LAYER_URL: "https://example.test/SceneServer/layers/0",
    });
    expect(config.portalUrl).toBe("https://example.maps.arcgis.com");
    expect(config.sceneLayerUrl).toBe("https://example.test/SceneServer/layers/0");
  });

  it("treats blank strings as unset", () => {
    const config = parseConfig({ VITE_SCENE_LAYER_URL: "   " });
    expect(config.sceneLayerUrl).toBeNull();
  });

  it("parses a valid numeric test object id", () => {
    const config = parseConfig({ VITE_TEST_OBJECT_ID: "42" });
    expect(config.testObjectId).toBe(42);
  });

  it("treats a non-numeric test object id as unset", () => {
    const config = parseConfig({ VITE_TEST_OBJECT_ID: "not-a-number" });
    expect(config.testObjectId).toBeNull();
  });
});

describe("hasSceneLayerTarget", () => {
  it("is false when neither url nor item id is configured", () => {
    expect(hasSceneLayerTarget(parseConfig({}))).toBe(false);
  });

  it("is true when a scene layer url is configured", () => {
    expect(hasSceneLayerTarget(parseConfig({ VITE_SCENE_LAYER_URL: "https://example.test/SceneServer/layers/0" }))).toBe(
      true,
    );
  });

  it("is true when a scene layer item id is configured", () => {
    expect(hasSceneLayerTarget(parseConfig({ VITE_SCENE_LAYER_ITEM_ID: "abc123" }))).toBe(true);
  });
});
