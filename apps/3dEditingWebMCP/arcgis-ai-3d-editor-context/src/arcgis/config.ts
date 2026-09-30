/**
 * Milestone 0 configuration: which portal/service to run the capability
 * check against. All values are optional placeholders read from Vite env
 * vars (see `.env.example`) — never hard-code portal URLs, item ids, or
 * credentials here. No authentication is wired up for milestone 0; only
 * publicly readable layers can be checked until an OAuth flow is added.
 */

export interface AppConfig {
  /** Portal URL; omit to use ArcGIS Online. */
  portalUrl: string | null;
  /** Optional WebScene item id, shown for visual context only. */
  webSceneItemId: string | null;
  /** Direct SceneLayer REST endpoint to run the capability check against. */
  sceneLayerUrl: string | null;
  /** Alternative to `sceneLayerUrl`: portal item id of the SceneLayer itself. */
  sceneLayerItemId: string | null;
  /** Disposable feature's OBJECTID used to probe mesh-query support. */
  testObjectId: number | null;
}

export type EnvLike = Record<string, string | boolean | undefined>;

function readString(env: EnvLike, key: string): string | null {
  const value = env[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readObjectId(env: EnvLike, key: string): number | null {
  const raw = readString(env, key);
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pure parser so config resolution is unit-testable without Vite's `import.meta.env`. */
export function parseConfig(env: EnvLike): AppConfig {
  return {
    portalUrl: readString(env, "VITE_PORTAL_URL"),
    webSceneItemId: readString(env, "VITE_WEBSCENE_ITEM_ID"),
    sceneLayerUrl: readString(env, "VITE_SCENE_LAYER_URL"),
    sceneLayerItemId: readString(env, "VITE_SCENE_LAYER_ITEM_ID"),
    testObjectId: readObjectId(env, "VITE_TEST_OBJECT_ID"),
  };
}

export function hasSceneLayerTarget(config: AppConfig): boolean {
  return Boolean(config.sceneLayerUrl || config.sceneLayerItemId);
}

export function loadConfig(): AppConfig {
  return parseConfig(import.meta.env as unknown as EnvLike);
}
