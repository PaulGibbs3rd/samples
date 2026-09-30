/**
 * Demo fixture used when no real test service is configured (see `config.ts`
 * / `.env.example`). This is NOT a live capability check — it exists so the
 * UI and report rendering are runnable out of the box, per AGENTS.md: "If
 * credentials or an editable service are missing, implement the independent
 * UI/logic with an explicit demo fixture, record the blocker, and do not
 * claim hosted edits work."
 */
import type { CapabilityReport } from "./types.js";

export const DEMO_CAPABILITY_REPORT: CapabilityReport = {
  mode: "demo-fixture",
  generatedAt: "1970-01-01T00:00:00.000Z",
  scene: {
    title: "DEMO FIXTURE — Sample Building (not a live service)",
    sourceUrl: null,
    geometryType: "mesh",
    isThreeDObjectSceneLayer: true,
    supportsQuery: true,
    supportsReturnMesh: true,
    supportsEditing: true,
    supportsGeometryUpdate: true,
    supportsAdd: false,
    supportsUpdate: true,
    supportsDelete: false,
  },
  associatedFeatureLayer: {
    found: true,
    title: "DEMO FIXTURE — Sample Building (associated FeatureLayer)",
    sourceUrl: null,
    supportsEditing: true,
    supportsGeometryUpdate: true,
    supportsAdd: false,
    supportsUpdate: true,
    supportsDelete: false,
    changeTracking: "unknown",
    glbFormatNote:
      "Demo fixture only — not verified against a real service. Configure VITE_SCENE_LAYER_URL or " +
      "VITE_SCENE_LAYER_ITEM_ID to run a live check.",
  },
  meshQueryProbe: {
    attempted: false,
    objectId: null,
    success: null,
    hasMesh: null,
    error: null,
  },
  blockers: [
    "No test service is configured (VITE_SCENE_LAYER_URL / VITE_SCENE_LAYER_ITEM_ID are unset). " +
      "This report is a demo fixture, not a verified capability check. Hosted edits are not confirmed to work.",
  ],
  notes: [
    "Set VITE_SCENE_LAYER_URL (or VITE_SCENE_LAYER_ITEM_ID) and VITE_TEST_OBJECT_ID in a local .env file " +
      "(copy .env.example) to run this check against a real, disposable test feature.",
  ],
};
