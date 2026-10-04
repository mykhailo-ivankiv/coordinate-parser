import { format } from "@coordinate-parser/formatter";
import { coordinateParser, usngParser } from "@coordinate-parser/parser";
import { fromWgs84ToUtm } from "@coordinate-parser/converter";
import type { Coordinate, WGS84Coordinate } from "@coordinate-parser/types";
import { describe, expect, it } from "vitest";
import { areaOf, coveringSquares, inSystem } from "./area.ts";

const parse = (input: string): Coordinate => {
  const result = coordinateParser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result[0];
};

const wgs84 = (latitude: number, longitude: number): WGS84Coordinate => ({
  system: "WGS84",
  latitude,
  longitude,
});

const kyiv = wgs84(50.4501, 30.5234);

describe("a WGS 84 point in each system", () => {
  it("gives the coordinate, or why the system cannot express it", () => {
    expect(inSystem(kyiv, "WGS84")).toEqual(kyiv);
    expect(inSystem(kyiv, "MGRS", 1000)).toMatchObject({ square: "UA", easting: 24000 });
    expect(inSystem(kyiv, "USNG", 100000)).toEqual({
      system: "USNG",
      error: "USNG requires at least one digit per axis, so its coarsest square is 10 km",
    });
  });
});

describe("the area a coordinate designates", () => {
  // Corner references computed with PROJ 9.3: EPSG:32636 to EPSG:4326.
  const kyivCorners = {
    southWest: wgs84(50.4445861, 30.5211213),
    southEast: wgs84(50.4448851, 30.535192),
    northEast: wgs84(50.4538701, 30.5347249),
    northWest: wgs84(50.453571, 30.5206516),
  };

  it("gives WGS 84 a point and no corners", () => {
    expect(areaOf(kyiv)).toEqual({
      centre: kyiv,
      southWest: null,
      southEast: null,
      northEast: null,
      northWest: null,
      outline: null,
      size: 0,
    });
  });

  it("gives an MGRS reference the square it names", () => {
    expect(areaOf(parse("36UUA2491"))).toEqual({
      centre: wgs84(50.4492283, 30.5279224),
      ...kyivCorners,
      // Over 1 km an edge strays from a straight line by about 2 cm, so the outline is the corners.
      outline: [
        kyivCorners.southWest,
        kyivCorners.southEast,
        kyivCorners.northEast,
        kyivCorners.northWest,
        kyivCorners.southWest,
      ],
      size: 1000,
    });
  });

  it("gives a UTM or UCS-2000 reference the metre square around it", () => {
    expect(areaOf(parse("36U 324182 5591608")).size).toBe(1);
    expect(areaOf(parse("5593954 6324226")).outline).toHaveLength(5);
  });
});

describe("the outline of a large square", () => {
  // 36UUA is the 100 km square from 300000E 5500000N in zone 36, south-west of Kyiv. Its southern
  // edge bows some 230 m away from the straight line between its corners on a web map.
  const outline = areaOf(parse("36UUA")).outline ?? [];

  it("follows the curved edges with extra points", () => {
    expect(outline.length).toBeGreaterThan(5);
  });

  it("closes the ring on the south-west corner", () => {
    expect(outline.at(-1)).toEqual(outline[0]);
  });

  it("puts every point on the square's edge, not on a chord", () => {
    for (const vertex of outline) {
      const { easting, northing } = fromWgs84ToUtm(vertex);
      const onEdge = [easting - 300000, easting - 400000, northing - 5500000, northing - 5600000];
      expect(onEdge.some((offset) => offset === 0)).toBe(true);
    }
  });

  it("passes through the middle of the southern edge where PROJ puts it", () => {
    // EPSG:32636 → EPSG:4326 on 350000E 5500000N.
    expect(outline).toContainEqual(wgs84(49.6339036, 30.9226471));
  });

  it("gives a 10 km square only the few points its gentler curve needs", () => {
    const tenKilometres = areaOf(parse("36UUA20")).outline ?? [];
    expect(tenKilometres.length).toBeGreaterThan(5);
    expect(tenKilometres.length).toBeLessThan(outline.length);
  });
});

// The squares as their references, for readable expectations.
const values = (coverage: ReturnType<typeof coveringSquares>) =>
  coverage.kind === "squares"
    ? coverage.squares.map((square) =>
        square.system === "WGS84" ? format([square, "WGS84"]) : format([square]),
      )
    : [];

describe("covering squares", () => {
  it("gives a point exactly one square", () => {
    expect(values(coveringSquares(parse("50.4501, 30.5234"), "MGRS", 1000))).toEqual(["36UUA2491"]);
  });

  it("maps a square onto itself, not onto the neighbours it only touches", () => {
    expect(values(coveringSquares(parse("36UUA2491"), "MGRS", 1000))).toEqual(["36UUA2491"]);
  });

  it("finds the one coarser square that contains a finer one", () => {
    expect(values(coveringSquares(parse("36UUA2491"), "MGRS", 10000))).toEqual(["36UUA29"]);
  });

  it("finds all hundred 100 m squares inside a 1 km one", () => {
    const squares = values(coveringSquares(parse("36UUA2491"), "MGRS", 100));
    expect(squares).toHaveLength(100);
    expect(new Set(squares).size).toBe(100);
    // The 1 km square's centre sits exactly where four 100 m squares meet, so whichever of them
    // comes first is as good as the others; all four must be there.
    for (const square of ["36UUA244914", "36UUA245914", "36UUA244915", "36UUA245915"]) {
      expect(squares).toContain(square);
    }
  });

  it("finds every UCS-2000 metre square a UTM metre square overlaps after the datum shift", () => {
    const squares = values(coveringSquares(parse("36U 324182 5591608"), "UCS-2000"));
    // A 1 m square shifted and rotated onto another 1 m grid reaches at most four of its squares.
    expect(squares.length).toBeGreaterThanOrEqual(1);
    expect(squares.length).toBeLessThanOrEqual(4);
    expect(squares[0]).toBe("5593954 6324226");
  });

  it("finds the four MGRS metre squares a UTM metre square straddles", () => {
    // UTM rounds, MGRS truncates: the UTM square is centred where four MGRS squares meet.
    expect(values(coveringSquares(parse("36U 324182 5591608"), "MGRS")).sort()).toEqual([
      "36UUA2418191607",
      "36UUA2418191608",
      "36UUA2418291607",
      "36UUA2418291608",
    ]);
  });

  it("refuses to list more squares than anyone would read", () => {
    const coverage = coveringSquares(parse("36UUA"), "MGRS", 1);
    expect(coverage).toMatchObject({ kind: "tooMany", primary: { system: "MGRS" } });
    if (coverage.kind === "tooMany") expect(coverage.count).toBeGreaterThan(1e9);
  });

  it("includes the squares of a USNG reference read with its own parser", () => {
    const usng = usngParser.run("36U UA 24 91");
    if (usng.isError) throw new Error(usng.error);
    expect(values(coveringSquares(usng.result[0], "USNG", 10000))).toEqual(["36U UA 2 9"]);
  });
});
