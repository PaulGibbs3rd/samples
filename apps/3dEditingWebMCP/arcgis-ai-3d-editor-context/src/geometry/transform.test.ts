import { describe, expect, it } from "vitest";
import { isRotationOnlyChange, normalizeDegrees, rotateBy, type ObjectTransform } from "./transform.js";

const BASE: ObjectTransform = {
  tx: 0,
  ty: 0,
  tz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  rx: 0,
  ry: 1,
  rz: 0,
  rdeg: 0,
};

describe("normalizeDegrees", () => {
  it("leaves values already in [0, 360) unchanged", () => {
    expect(normalizeDegrees(45)).toBe(45);
    expect(normalizeDegrees(0)).toBe(0);
  });

  it("wraps values at or above 360", () => {
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(720 + 15)).toBe(15);
  });

  it("wraps negative values into the positive range", () => {
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(-370)).toBe(350);
  });
});

describe("rotateBy", () => {
  it("adds the delta to the existing angle and normalizes it", () => {
    const result = rotateBy(BASE, 45);
    expect(result.rdeg).toBe(45);
  });

  it("wraps past 360 back to 0", () => {
    const result = rotateBy({ ...BASE, rdeg: 350 }, 20);
    expect(result.rdeg).toBe(10);
  });

  it("handles negative deltas", () => {
    const result = rotateBy({ ...BASE, rdeg: 10 }, -20);
    expect(result.rdeg).toBe(350);
  });

  it("never mutates translation, scale, or the rotation axis", () => {
    const result = rotateBy(BASE, 90);
    expect(result.tx).toBe(BASE.tx);
    expect(result.sy).toBe(BASE.sy);
    expect(result.rx).toBe(BASE.rx);
    expect(result.ry).toBe(BASE.ry);
    expect(result.rz).toBe(BASE.rz);
  });

  it("does not mutate the original object", () => {
    const original = { ...BASE };
    rotateBy(original, 30);
    expect(original).toEqual(BASE);
  });

  it("rejects non-finite deltas", () => {
    expect(() => rotateBy(BASE, Number.NaN)).toThrow();
    expect(() => rotateBy(BASE, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("isRotationOnlyChange", () => {
  it("is true when only rdeg differs", () => {
    const candidate = rotateBy(BASE, 45);
    expect(isRotationOnlyChange(BASE, candidate)).toBe(true);
  });

  it("is false when translation differs", () => {
    const candidate = { ...rotateBy(BASE, 45), tx: 5 };
    expect(isRotationOnlyChange(BASE, candidate)).toBe(false);
  });

  it("is false when the rotation axis differs", () => {
    const candidate = { ...rotateBy(BASE, 45), rx: 1, ry: 0 };
    expect(isRotationOnlyChange(BASE, candidate)).toBe(false);
  });
});
