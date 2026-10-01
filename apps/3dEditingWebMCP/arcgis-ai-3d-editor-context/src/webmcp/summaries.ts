/**
 * Pure, JSON-serializable summaries for milestone 2's WebMCP read tools.
 * Per `docs/architecture.md`: "summarize its attributes and mesh bounds
 * without sending a whole vertex buffer to the agent" — these summaries
 * expose only the small, curated `esri3do_*` transform fields and footprint
 * extent, never the full raw attributes blob or any SDK object. No
 * `@arcgis/core` import, so this stays unit-testable without a live service.
 */
import type { AppConfig } from "../arcgis/config.js";
import type { ObjectInspection } from "../arcgis/object-transform.js";
import type { EditSession } from "../editing/edit-session.js";

export interface SceneSummary {
  portalUrl: string | null;
  sceneLayerUrl: string | null;
  sceneLayerItemId: string | null;
  /** Whether the associated FeatureLayer has been loaded yet in this session. */
  featureLayerLoaded: boolean;
  /** Convenience hint for an agent exploring the demo; not a guarantee the id exists. */
  suggestedTestObjectId: number | null;
}

export function summarizeScene(config: AppConfig, featureLayerLoaded: boolean): SceneSummary {
  return {
    portalUrl: config.portalUrl,
    sceneLayerUrl: config.sceneLayerUrl,
    sceneLayerItemId: config.sceneLayerItemId,
    featureLayerLoaded,
    suggestedTestObjectId: config.testObjectId,
  };
}

export interface PendingPreviewSummary {
  kind: "rotation" | "translation" | "scale";
  /** Candidate transform fields, regardless of which kind of edit produced them. */
  candidateAngleDegrees: number;
  candidateTranslation: { x: number; y: number; z: number };
  candidateScale: { x: number; y: number; z: number };
  /** Present only when kind === "rotation". */
  deltaDegrees: number | null;
  /** Present only when kind === "translation", in the layer's spatial reference linear units. */
  translationDelta: { dx: number; dy: number; dz: number } | null;
  /** Present only when kind === "scale"; uniform factor applied to sx/sy/sz. */
  scaleFactor: number | null;
}

export interface SelectionSummary {
  status: EditSession["status"];
  objectId: number | null;
  displayName: string | null;
  layerUrl: string | null;
  /** Last service-confirmed angle (degrees), never the pending preview. */
  currentAngleDegrees: number | null;
  /** Local-only preview candidate, if a rotation/translation/scale is currently proposed; never persisted. */
  pendingPreview: PendingPreviewSummary | null;
  error: string | null;
}

export function summarizeSelection(session: EditSession): SelectionSummary {
  const { candidate, pendingChange } = session;
  const pendingPreview: PendingPreviewSummary | null =
    candidate && pendingChange
      ? {
          kind: pendingChange.kind,
          candidateAngleDegrees: candidate.rdeg,
          candidateTranslation: { x: candidate.tx, y: candidate.ty, z: candidate.tz },
          candidateScale: { x: candidate.sx, y: candidate.sy, z: candidate.sz },
          deltaDegrees: pendingChange.kind === "rotation" ? pendingChange.deltaDegrees : null,
          translationDelta:
            pendingChange.kind === "translation"
              ? { dx: pendingChange.dx, dy: pendingChange.dy, dz: pendingChange.dz }
              : null,
          scaleFactor: pendingChange.kind === "scale" ? pendingChange.factor : null,
        }
      : null;
  return {
    status: session.status,
    objectId: session.selected?.objectId ?? null,
    displayName: session.selected?.displayName ?? null,
    layerUrl: session.selected?.layerUrl ?? null,
    currentAngleDegrees: session.original?.rdeg ?? null,
    pendingPreview,
    error: session.error,
  };
}

export interface InspectionSummary {
  objectId: number;
  displayName: string;
  footprintExtent: { width: number; height: number; spatialReferenceWkid: number | null } | null;
  /** Current rotation angle in degrees, and the fixed axis it rotates around. */
  rotation: { angleDegrees: number; axis: { x: number; y: number; z: number } };
  translation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export function summarizeInspection(inspection: ObjectInspection): InspectionSummary {
  const { transform } = inspection;
  return {
    objectId: inspection.selected.objectId,
    displayName: inspection.selected.displayName,
    footprintExtent: inspection.footprintExtent,
    rotation: { angleDegrees: transform.rdeg, axis: { x: transform.rx, y: transform.ry, z: transform.rz } },
    translation: { x: transform.tx, y: transform.ty, z: transform.tz },
    scale: { x: transform.sx, y: transform.sy, z: transform.sz },
  };
}
