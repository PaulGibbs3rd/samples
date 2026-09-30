/**
 * Pure edit-session state machine for milestone 1. Both the visible UI and
 * the future WebMCP adapter (milestone 2) are meant to call the same
 * "application commands" (`docs/architecture.md`): this module is that
 * shared core. No `@arcgis/core` dependency — SDK calls (query, applyEdits)
 * live in `src/arcgis/object-transform.ts` and are orchestrated by the
 * caller, keeping this reducer synchronous and easy to unit test.
 */
import type { ObjectTransform } from "../geometry/transform.js";
import { rotateBy } from "../geometry/transform.js";

export type EditSessionStatus = "idle" | "selected" | "previewing" | "applying" | "applied" | "error";

export interface SelectedObject {
  layerUrl: string;
  objectId: number;
  /** Human-readable label for display (falls back to the object id). */
  displayName: string;
  /** Raw attributes as returned by the query, for the inspect panel. Untrusted service content. */
  attributes: Record<string, unknown>;
}

export interface ApplyResult {
  success: boolean;
  objectId: number;
  /** Per-feature error message from `applyEdits()`, if any. */
  error: string | null;
  appliedAt: string;
}

export interface EditSession {
  status: EditSessionStatus;
  selected: SelectedObject | null;
  /** Deep-copied transform as last confirmed from the service (never mutated by preview). */
  original: ObjectTransform | null;
  /** Local-only candidate transform; never sent to the service until apply. */
  candidate: ObjectTransform | null;
  /** The delta angle (degrees) that produced `candidate`, for display. */
  pendingDeltaDegrees: number | null;
  error: string | null;
  lastApplyResult: ApplyResult | null;
}

export function createIdleSession(): EditSession {
  return {
    status: "idle",
    selected: null,
    original: null,
    candidate: null,
    pendingDeltaDegrees: null,
    error: null,
    lastApplyResult: null,
  };
}

/** Selecting a new object always discards any pending preview or apply outcome from a prior object. */
export function selectObject(selected: SelectedObject, original: ObjectTransform): EditSession {
  return {
    status: "selected",
    selected,
    original,
    candidate: null,
    pendingDeltaDegrees: null,
    error: null,
    lastApplyResult: null,
  };
}

/**
 * Computes a local preview candidate from the session's original transform.
 * Never mutates `session.original`; per architecture.md, a preview is local,
 * nonpersistent state.
 */
export function proposeRotation(session: EditSession, deltaDegrees: number): EditSession {
  if (session.status === "idle" || !session.selected || !session.original) {
    throw new Error("proposeRotation requires a selected object");
  }
  const candidate = rotateBy(session.original, deltaDegrees);
  return {
    ...session,
    status: "previewing",
    candidate,
    pendingDeltaDegrees: deltaDegrees,
    error: null,
  };
}

/** Discards the pending preview and returns to the selected (unmodified) state. */
export function cancelProposal(session: EditSession): EditSession {
  return {
    ...session,
    status: "selected",
    candidate: null,
    pendingDeltaDegrees: null,
    error: null,
  };
}

/** Marks the session as mid-apply; the caller is responsible for the actual `applyEdits()` call. */
export function beginApply(session: EditSession): EditSession {
  if (session.status !== "previewing" || !session.candidate) {
    throw new Error("beginApply requires a pending preview");
  }
  return { ...session, status: "applying", error: null };
}

/**
 * Records a successful, service-confirmed apply. The new candidate becomes
 * the authoritative `original`, and the pending preview is cleared. Fold
 * `requeryResult` (a fresh query reply) here so `original` reflects the
 * persisted state, not merely what was requested, per architecture.md's
 * insistence that a promise alone is not proof of success.
 */
export function completeApply(session: EditSession, confirmed: ObjectTransform, result: ApplyResult): EditSession {
  return {
    ...session,
    status: "applied",
    original: confirmed,
    candidate: null,
    pendingDeltaDegrees: null,
    error: null,
    lastApplyResult: result,
  };
}

/** Records a failed apply. The original, service-confirmed state is left untouched. */
export function failApply(session: EditSession, error: string, result: ApplyResult | null): EditSession {
  return {
    ...session,
    status: "error",
    candidate: null,
    pendingDeltaDegrees: null,
    error,
    lastApplyResult: result,
  };
}
