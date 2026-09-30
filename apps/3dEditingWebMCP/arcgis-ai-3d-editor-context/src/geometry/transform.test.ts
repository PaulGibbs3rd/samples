import { describe, expect, it } from "vitest";
import {
  isRotationOnlyChange,
  normalizeDegrees,
  rotateBy,
  scaleBy,
  translateBy,
  type ObjectTransform,
} from "./transform.js";

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

describe("translateBy", () => {
  it("adds the deltas to the existing translation", () => {
    const result = translateBy(BASE, 1, 2, 3);
    expect(result.tx).toBe(1);
    expect(result.ty).toBe(2);
    expect(result.tz).toBe(3);
  });

  it("accumulates on top of an existing offset", () => {
    const result = translateBy({ ...BASE, tx: 5, ty: -2, tz: 0 }, 1, 1, 1);
    expect(result.tx).toBe(6);
    expect(result.ty).toBe(-1);
    expect(result.tz).toBe(1);
  });

  it("never mutates scale or rotation", () => {
    const result = translateBy(BASE, 1, 1, 1);
    expect(result.sx).toBe(BASE.sx);
    expect(result.rdeg).toBe(BASE.rdeg);
  });

  it("does not mutate the original object", () => {
    const original = { ...BASE };
    translateBy(original, 1, 1, 1);
    expect(original).toEqual(BASE);
  });

  it("rejects non-finite deltas", () => {
    expect(() => translateBy(BASE, Number.NaN, 0, 0)).toThrow();
    expect(() => translateBy(BASE, 0, Number.POSITIVE_INFINITY, 0)).toThrow();
  });
});

describe("scaleBy", () => {
  it("multiplies all three scale axes by the factor", () => {
    const result = scaleBy(BASE, 2);
    expect(result.sx).toBe(2);
    expect(result.sy).toBe(2);
    expect(result.sz).toBe(2);
  });

  it("compounds on top of an existing non-uniform scale", () => {
    const result = scaleBy({ ...BASE, sx: 2, sy: 3, sz: 4 }, 0.5);
    expect(result.sx).toBe(1);
    expect(result.sy).toBe(1.5);
    expect(result.sz).toBe(2);
  });

  it("never mutates translation or rotation", () => {
    const result = scaleBy(BASE, 2);
    expect(result.tx).toBe(BASE.tx);
    expect(result.rdeg).toBe(BASE.rdeg);
  });

  it("does not mutate the original object", () => {
    const original = { ...BASE };
    scaleBy(original, 2);
    expect(original).toEqual(BASE);
  });

  it("rejects non-finite factors", () => {
    expect(() => scaleBy(BASE, Number.NaN)).toThrow();
    expect(() => scaleBy(BASE, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("rejects zero and negative factors", () => {
    expect(() => scaleBy(BASE, 0)).toThrow();
    expect(() => scaleBy(BASE, -1)).toThrow();
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
