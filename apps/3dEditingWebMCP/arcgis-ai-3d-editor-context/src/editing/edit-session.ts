/**
 * Pure edit-session state machine for milestone 1. Both the visible UI and
 * the future WebMCP adapter (milestone 2) are meant to call the same
 * "application commands" (`docs/architecture.md`): this module is that
 * shared core. No `@arcgis/core` dependency — SDK calls (query, applyEdits)
 * live in `src/arcgis/object-transform.ts` and are orchestrated by the
 * caller, keeping this reducer synchronous and easy to unit test.
 */
import type { ObjectTransform } from "../geometry/transform.js";
import { rotateBy, scaleBy, translateBy } from "../geometry/transform.js";

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

/**
 * Describes, for display, which local proposal produced `session.candidate`.
 * Only one kind of edit can be pending at a time in milestone 3's UI — the
 * candidate transform itself (not this descriptor) is what gets applied.
 */
export type PendingChange =
  | { kind: "rotation"; deltaDegrees: number }
  | { kind: "translation"; dx: number; dy: number; dz: number }
  | { kind: "scale"; factor: number };

export interface EditSession {
  status: EditSessionStatus;
  selected: SelectedObject | null;
  /** Deep-copied transform as last confirmed from the service (never mutated by preview). */
  original: ObjectTransform | null;
  /** Local-only candidate transform; never sent to the service until apply. */
  candidate: ObjectTransform | null;
  /** Describes the pending edit that produced `candidate`, for display. */
  pendingChange: PendingChange | null;
  error: string | null;
  lastApplyResult: ApplyResult | null;
}

export function createIdleSession(): EditSession {
  return {
    status: "idle",
    selected: null,
    original: null,
    candidate: null,
    pendingChange: null,
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
    pendingChange: null,
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
    pendingChange: { kind: "rotation", deltaDegrees },
    error: null,
  };
}

/**
 * Computes a local translation preview candidate (dx/dy/dz added to the
 * existing offset, in the layer's spatial reference linear units). Callers
 * are expected to have already rejected non-projected spatial references
 * (see `editing/commands.ts`) before calling this.
 */
export function proposeTranslation(session: EditSession, dx: number, dy: number, dz: number): EditSession {
  if (session.status === "idle" || !session.selected || !session.original) {
    throw new Error("proposeTranslation requires a selected object");
  }
  const candidate = translateBy(session.original, dx, dy, dz);
  return {
    ...session,
    status: "previewing",
    candidate,
    pendingChange: { kind: "translation", dx, dy, dz },
    error: null,
  };
}

/** Computes a local scale preview candidate (existing per-axis scale multiplied uniformly by `factor`). */
export function proposeScale(session: EditSession, factor: number): EditSession {
  if (session.status === "idle" || !session.selected || !session.original) {
    throw new Error("proposeScale requires a selected object");
  }
  const candidate = scaleBy(session.original, factor);
  return {
    ...session,
    status: "previewing",
    candidate,
    pendingChange: { kind: "scale", factor },
    error: null,
  };
}

/** Discards the pending preview and returns to the selected (unmodified) state. */
export function cancelProposal(session: EditSession): EditSession {
  return {
    ...session,
    status: "selected",
    candidate: null,
    pendingChange: null,
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
    pendingChange: null,
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
    pendingChange: null,
    error,
    lastApplyResult: result,
  };
}
