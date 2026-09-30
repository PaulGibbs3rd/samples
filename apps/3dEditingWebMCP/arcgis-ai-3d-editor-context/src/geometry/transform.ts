/**
 * Pure transform math for a 3D Object SceneLayer feature's `esri3do_*`
 * attribute-driven transform (translation, scale, rotation axis + degrees).
 *
 * As established while investigating milestone 1 (see README), the SDK's
 * public `geometry` for these features always resolves to an empty
 * placeholder `Mesh` (0 vertices) over `queryFeatures()` — even after the
 * layer is added to a rendered view and hit-tested. The real, editable
 * transform is the flat set of `esri3do_*` fields on the associated
 * FeatureLayer, not `Mesh`/`MeshTransform`. This module has no `@arcgis/core`
 * dependency so it stays pure and unit-testable.
 */

export interface ObjectTransform {
  /** Translation offset from the asset origin, in the layer's spatial reference units. */
  tx: number;
  ty: number;
  tz: number;
  /** Non-uniform scale factors. */
  sx: number;
  sy: number;
  sz: number;
  /** Unit rotation axis (asset-local convention; not assumed to be world Z). */
  rx: number;
  ry: number;
  rz: number;
  /** Rotation angle around (rx, ry, rz), in degrees. */
  rdeg: number;
}

/** Wraps a degree value into the [0, 360) range so repeated deltas do not grow unbounded. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Returns a new transform with `deltaDegrees` added to the existing rotation
 * angle, normalized to [0, 360). Milestone 1 assumes rotation around the
 * object's single existing (already-configured) axis only — translation,
 * scale, and the axis vector itself are never changed by this operation, per
 * `docs/architecture.md`'s "Z-axis rotation only" scope decision.
 */
export function rotateBy(original: ObjectTransform, deltaDegrees: number): ObjectTransform {
  if (!Number.isFinite(deltaDegrees)) {
    throw new Error(`rotateBy requires a finite delta angle, got: ${deltaDegrees}`);
  }
  return {
    ...original,
    rdeg: normalizeDegrees(original.rdeg + deltaDegrees),
  };
}

/** True when a candidate transform differs from the original only in `rdeg`. */
export function isRotationOnlyChange(original: ObjectTransform, candidate: ObjectTransform): boolean {
  return (
    original.tx === candidate.tx &&
    original.ty === candidate.ty &&
    original.tz === candidate.tz &&
    original.sx === candidate.sx &&
    original.sy === candidate.sy &&
    original.sz === candidate.sz &&
    original.rx === candidate.rx &&
    original.ry === candidate.ry &&
    original.rz === candidate.rz
  );
}
