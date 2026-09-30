/**
 * Renders the real 3D scene for the demo: adds the exact `SceneLayer`
 * instance `editing/commands.ts` also uses for `applyEdits()` (so an applied
 * rotation is reflected by the same rendered layer, without a manual
 * reload), plus the live-rotating preview "ghost" `GraphicsLayer` from
 * `ui/scene-preview.ts`. No-ops (removing the `<arcgis-scene>` element)
 * when no test service is configured — same demo-fixture mode as milestone 0.
 *
 * `basemap`/`ground` are set declaratively on the element in `index.html`;
 * there is no WebScene item configured (see `.env`), so this only adds
 * layers imperatively per `@arcgis/map-components`'s documented
 * `viewOnReady()` + `map.add(layer)` pattern (no `<arcgis-scene-layer>`
 * custom element exists in this SDK version).
 */
import type { ArcgisScene } from "@arcgis/map-components/components/arcgis-scene";

import { hasSceneLayerTarget, type AppConfig } from "./config.js";
import type { EditorCommands } from "../editing/commands.js";
import { mountScenePreview } from "../ui/scene-preview.js";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function mountSceneView(
  sceneEl: Element | null,
  config: AppConfig,
  commands: EditorCommands,
  onGhostError?: (message: string) => void,
): Promise<void> {
  if (!sceneEl) return;
  if (!hasSceneLayerTarget(config)) {
    sceneEl.remove();
    return;
  }

  const el = sceneEl as unknown as ArcgisScene;

  try {
    await el.viewOnReady();
    const sceneLayer = await commands.getDisplaySceneLayer();
    const ghostLayer = mountScenePreview(commands, onGhostError);

    el.map?.add(sceneLayer);
    el.map?.add(ghostLayer);

    await sceneLayer.when();
    if (sceneLayer.fullExtent) {
      await el.goTo({ target: sceneLayer.fullExtent.clone().expand(4) });
    }
  } catch (err) {
    onGhostError?.(`Scene failed to render: ${describeError(err)}`);
  }
}
