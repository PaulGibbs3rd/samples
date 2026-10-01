import { describe, expect, it } from "vitest";
import {
  beginApply,
  cancelProposal,
  completeApply,
  createIdleSession,
  failApply,
  proposeRotation,
  proposeScale,
  proposeTranslation,
  selectObject,
  type SelectedObject,
} from "./edit-session.js";
import type { ObjectTransform } from "../geometry/transform.js";

const TRANSFORM: ObjectTransform = { tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1, rx: 0, ry: 1, rz: 0, rdeg: 0 };
const SELECTED: SelectedObject = {
  layerUrl: "https://example.test/FeatureServer/0",
  objectId: 1,
  displayName: "Object 1",
  attributes: { OBJECTID: 1 },
};

describe("createIdleSession", () => {
  it("starts idle with no selection", () => {
    const session = createIdleSession();
    expect(session.status).toBe("idle");
    expect(session.selected).toBeNull();
  });
});

describe("selectObject", () => {
  it("moves to selected and clears any prior preview/apply state", () => {
    const session = selectObject(SELECTED, TRANSFORM);
    expect(session.status).toBe("selected");
    expect(session.selected).toBe(SELECTED);
    expect(session.original).toBe(TRANSFORM);
    expect(session.candidate).toBeNull();
    expect(session.lastApplyResult).toBeNull();
  });
});

describe("proposeRotation", () => {
  it("computes a local candidate without touching original", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeRotation(selected, 45);
    expect(previewing.status).toBe("previewing");
    expect(previewing.candidate?.rdeg).toBe(45);
    expect(previewing.original).toBe(TRANSFORM);
    expect(previewing.pendingChange).toEqual({ kind: "rotation", deltaDegrees: 45 });
  });

  it("throws when nothing is selected", () => {
    expect(() => proposeRotation(createIdleSession(), 10)).toThrow();
  });
});

describe("proposeTranslation", () => {
  it("computes a local candidate without touching original", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeTranslation(selected, 1, 2, 3);
    expect(previewing.status).toBe("previewing");
    expect(previewing.candidate).toEqual({ ...TRANSFORM, tx: 1, ty: 2, tz: 3 });
    expect(previewing.original).toBe(TRANSFORM);
    expect(previewing.pendingChange).toEqual({ kind: "translation", dx: 1, dy: 2, dz: 3 });
  });

  it("throws when nothing is selected", () => {
    expect(() => proposeTranslation(createIdleSession(), 1, 0, 0)).toThrow();
  });

  it("throws on non-finite deltas", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    expect(() => proposeTranslation(selected, Number.NaN, 0, 0)).toThrow();
  });
});

describe("proposeScale", () => {
  it("computes a local candidate without touching original", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeScale(selected, 2);
    expect(previewing.status).toBe("previewing");
    expect(previewing.candidate).toEqual({ ...TRANSFORM, sx: 2, sy: 2, sz: 2 });
    expect(previewing.original).toBe(TRANSFORM);
    expect(previewing.pendingChange).toEqual({ kind: "scale", factor: 2 });
  });

  it("throws when nothing is selected", () => {
    expect(() => proposeScale(createIdleSession(), 2)).toThrow();
  });

  it("throws on a zero or negative factor", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    expect(() => proposeScale(selected, 0)).toThrow();
    expect(() => proposeScale(selected, -1)).toThrow();
  });
});

describe("cancelProposal", () => {
  it("discards the candidate and returns to selected, leaving original untouched", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeRotation(selected, 90);
    const cancelled = cancelProposal(previewing);
    expect(cancelled.status).toBe("selected");
    expect(cancelled.candidate).toBeNull();
    expect(cancelled.original).toBe(TRANSFORM);
  });
});

describe("beginApply / completeApply / failApply", () => {
  it("moves previewing -> applying -> applied, folding the requeried transform into original", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeRotation(selected, 45);
    const applying = beginApply(previewing);
    expect(applying.status).toBe("applying");

    const confirmed = { ...TRANSFORM, rdeg: 45 };
    const result = { success: true, objectId: 1, error: null, appliedAt: "2026-01-01T00:00:00.000Z" };
    const applied = completeApply(applying, confirmed, result);

    expect(applied.status).toBe("applied");
    expect(applied.original).toBe(confirmed);
    expect(applied.candidate).toBeNull();
    expect(applied.lastApplyResult).toBe(result);
  });

  it("throws beginApply when there is no pending preview", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    expect(() => beginApply(selected)).toThrow();
  });

  it("moves to error and keeps the original transform on failure", () => {
    const selected = selectObject(SELECTED, TRANSFORM);
    const previewing = proposeRotation(selected, 45);
    const applying = beginApply(previewing);
    const result = { success: false, objectId: 1, error: "service rejected update", appliedAt: "2026-01-01T00:00:00.000Z" };
    const failed = failApply(applying, "service rejected update", result);

    expect(failed.status).toBe("error");
    expect(failed.original).toBe(TRANSFORM);
    expect(failed.candidate).toBeNull();
    expect(failed.error).toBe("service rejected update");
    expect(failed.lastApplyResult).toBe(result);
  });
});
