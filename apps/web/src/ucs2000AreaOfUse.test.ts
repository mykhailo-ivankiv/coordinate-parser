import { fromWgs84ToUcs2000 } from "@coordinate-parser/converter";
import { describe, expect, it } from "vitest";
import { insideUcs2000AreaOfUse } from "./ucs2000AreaOfUse.ts";

const point = (latitude: number, longitude: number) => ({
  system: "WGS84" as const,
  latitude,
  longitude,
});

describe("UCS-2000 area of use", () => {
  it("counts Kyiv, Lviv and Kharkiv as inside it", () => {
    expect(insideUcs2000AreaOfUse(point(50.4501, 30.5234))).toBe(true);
    expect(insideUcs2000AreaOfUse(point(49.8397, 24.0297))).toBe(true);
    expect(insideUcs2000AreaOfUse(point(49.9935, 36.2304))).toBe(true);
  });

  it("leaves Minsk, Bucharest and Istanbul outside it, though all three are in zones 4-7", () => {
    expect(insideUcs2000AreaOfUse(point(53.9006, 27.559))).toBe(false);
    expect(insideUcs2000AreaOfUse(point(44.4268, 26.1025))).toBe(false);
    expect(insideUcs2000AreaOfUse(point(41.0082, 28.9784))).toBe(false);
  });

  it("takes in Chișinău, because EPSG's areas are boxes around Ukraine, not its border", () => {
    expect(insideUcs2000AreaOfUse(point(47.0105, 28.8638))).toBe(true);
  });

  it("is a warning only: the converter still converts a point outside it", () => {
    const bucharest = point(44.4268, 26.1025);
    expect(fromWgs84ToUcs2000(bucharest)).toMatchObject({ system: "UCS-2000", zone: 5 });
    expect(insideUcs2000AreaOfUse(bucharest)).toBe(false);
  });
});
