/**
 * Builds a client-side, rotatable "ghost" proxy `Mesh` for the live-preview
 * demo, by fetching the same raw glTF asset the SceneLayer renderer consumes
 * internally (see README's milestone 0 findings: `queryFeatures()` always
 * resolves 3D Object geometry to an empty placeholder Mesh with 0 vertices —
 * the real geometry only exists as a glTF asset reachable through the
 * `query3d` endpoint's `assetMaps`, which is not exposed by any typed SDK
 * method here, hence the raw `fetch()` calls below).
 *
 * `esri3do_tx/ty/tz`, `esri3do_sx/sy/sz`, `esri3do_rx/ry/rz`, `esri3do_rdeg`
 * map 1:1 onto `@arcgis/core/geometry/support/MeshTransform`'s
 * `translation`/`scale`/`rotationAxis`/`rotationAngle` properties, so the
 * exact `ObjectTransform` milestone 1 already reads/writes can be applied
 * directly to a `Mesh.transform` to reproduce the object's real pose —
 * no separate math is needed to keep the ghost and the persisted attributes
 * in sync.
 */
import Mesh from "@arcgis/core/geometry/Mesh.js";
import MeshTransform from "@arcgis/core/geometry/support/MeshTransform.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils.js";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import type { ObjectTransform } from "../geometry/transform.js";

interface AssetMapEntry {
  assetType?: string;
  parentGlobalId?: string;
  assetURL?: string;
  conversionStatus?: string;
}

interface Query3DResponse {
  assetMaps?: AssetMapEntry[];
}

export interface MeshOrigin {
  x: number;
  y: number;
  z: number;
}

function isAbsoluteOrDataUri(uri: string): boolean {
  return /^(https?:|data:)/i.test(uri);
}

/**
 * Returns the layer's REST URL including its `/<layerId>` segment. A
 * `FeatureLayer` resolved from `SceneLayer.associatedLayer` reports `.url`
 * as the bare service root (e.g. `.../FeatureServer`, no layer index) even
 * though `queryFeatures()` etc. transparently add it — live-verified against
 * `SeattleCube_3DObject`, where omitting this segment made `query3d` silently
 * return an empty `assetMaps` array instead of an error. If the url's last
 * path segment is already numeric, it's assumed to already include the
 * layer id and is left untouched.
 */
function resolveLayerUrl(featureLayer: FeatureLayer): string | undefined {
  const url = featureLayer.url;
  if (!url) {
    return undefined;
  }
  const trimmed = url.replace(/\/$/, "");
  const lastSegment = trimmed.split("/").pop() ?? "";
  if (/^\d+$/.test(lastSegment)) {
    return trimmed;
  }
  const layerId = featureLayer.layerId ?? 0;
  return `${trimmed}/${layerId}`;
}

/**
 * Fetches the object's raw glTF asset (via `query3d?formatOf3DObjects=3D_gltf`)
 * and rewrites any relative buffer `uri` to the matching binary asset's
 * absolute `assetURL`. This service publishes glTF buffers with a plain
 * filename (e.g. `esriGeometryMultiPatch_ESRI3DODERIVED.bin`) that does not
 * resolve against the hash-based `.../assets/<hash>` URL the glTF itself was
 * fetched from — live-verified against the real `SeattleCube_3DObject`
 * service — so a standard glTF loader cannot find the buffer without this
 * rewrite. Returns an object URL for the rewritten glTF; the caller is
 * responsible for revoking it once loading is complete.
 */
export async function fetchGltfBlobUrl(featureLayer: FeatureLayer, objectId: number, globalId: string): Promise<string> {
  const layerUrl = resolveLayerUrl(featureLayer);
  if (!layerUrl) {
    throw new Error("FeatureLayer has no url; cannot fetch its raw glTF asset for the preview ghost.");
  }

  const query3dUrl = `${layerUrl}/query3d?f=json&objectIds=${objectId}&formatOf3DObjects=3D_gltf`;
  const query3dResponse = await fetch(query3dUrl);
  if (!query3dResponse.ok) {
    throw new Error(`query3d request failed: ${query3dResponse.status} ${query3dResponse.statusText}`);
  }
  const body = (await query3dResponse.json()) as Query3DResponse;
  const assetMaps = body.assetMaps ?? [];

  const gltfAsset = assetMaps.find(
    (asset) => asset.assetType === "3D_gltf" && asset.parentGlobalId === globalId && asset.assetURL,
  );
  if (!gltfAsset?.assetURL) {
    throw new Error(`No completed 3D_gltf asset found for object id ${objectId} (globalid ${globalId}).`);
  }
  const binAsset = assetMaps.find(
    (asset) => asset.assetType === "binary" && asset.parentGlobalId === globalId && asset.assetURL,
  );

  const gltfResponse = await fetch(gltfAsset.assetURL);
  if (!gltfResponse.ok) {
    throw new Error(`Failed to fetch the glTF asset: ${gltfResponse.status} ${gltfResponse.statusText}`);
  }
  const gltfJson = (await gltfResponse.json()) as { buffers?: Array<{ uri?: string }> };

  if (binAsset?.assetURL && Array.isArray(gltfJson.buffers)) {
    for (const buffer of gltfJson.buffers) {
      if (typeof buffer.uri === "string" && !isAbsoluteOrDataUri(buffer.uri)) {
        buffer.uri = binAsset.assetURL;
      }
    }
  }

  const blob = new Blob([JSON.stringify(gltfJson)], { type: "model/gltf+json" });
  return URL.createObjectURL(blob);
}

/**
 * Loads the object's raw glTF as an untransformed `Mesh` anchored at its
 * real-world asset origin (`esri3do_ox/oy/oz`). Apply an `ObjectTransform`
 * with `applyTransformToMesh()` to reproduce (or preview a candidate change
 * to) the object's pose.
 */
export async function loadRawMesh(
  featureLayer: FeatureLayer,
  objectId: number,
  globalId: string,
  origin: MeshOrigin,
  spatialReference: SpatialReference,
): Promise<Mesh> {
  const blobUrl = await fetchGltfBlobUrl(featureLayer, objectId, globalId);
  try {
    const location = new Point({ x: origin.x, y: origin.y, z: origin.z, spatialReference });
    return await meshUtils.createFromGLTF(location, blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Applies an `ObjectTransform` to a mesh's local transform, matching the `esri3do_*` attribute semantics exactly. */
export function applyTransformToMesh(mesh: Mesh, transform: ObjectTransform): void {
  mesh.transform = new MeshTransform({
    translation: [transform.tx, transform.ty, transform.tz],
    scale: [transform.sx, transform.sy, transform.sz],
    rotationAxis: [transform.rx, transform.ry, transform.rz],
    rotationAngle: transform.rdeg,
  });
}
