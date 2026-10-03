import { format } from "@coordinate-parser/formatter";
import { coordinateParser, usngParser } from "@coordinate-parser/parser";
import { describe, expect, it } from "vitest";
import { areaOf } from "./coordinateConverter.ts";
import { coveringSquares } from "./coverage.ts";

const areaFor = (input: string) => {
  const result = coordinateParser.run(input);
  if (result.isError) throw new Error(result.error);
  return areaOf(result.result[0]);
};

// The squares as their references, for readable expectations.
const values = (coverage: ReturnType<typeof coveringSquares>) =>
  coverage.kind === "squares"
    ? coverage.squares.map((square) =>
        square.system === "WGS84" ? format([square, "WGS84"]) : format([square]),
      )
    : [];

describe("covering squares", () => {
  it("gives a point exactly one square", () => {
    expect(
      values(coveringSquares(areaFor("50.4501, 30.5234"), "MGRS", { precision: 1000 })),
    ).toEqual(["36UUA2491"]);
  });

  it("maps a square onto itself, not onto the neighbours it only touches", () => {
    expect(values(coveringSquares(areaFor("36UUA2491"), "MGRS", { precision: 1000 }))).toEqual([
      "36UUA2491",
    ]);
  });

  it("finds the one coarser square that contains a finer one", () => {
    expect(values(coveringSquares(areaFor("36UUA2491"), "MGRS", { precision: 10000 }))).toEqual([
      "36UUA29",
    ]);
  });

  it("finds all hundred 100 m squares inside a 1 km one", () => {
    const squares = values(coveringSquares(areaFor("36UUA2491"), "MGRS", { precision: 100 }));
    expect(squares).toHaveLength(100);
    expect(new Set(squares).size).toBe(100);
    // The 1 km square's centre sits exactly where four 100 m squares meet, so whichever of them
    // comes first is as good as the others; all four must be there.
    for (const square of ["36UUA244914", "36UUA245914", "36UUA244915", "36UUA245915"]) {
      expect(squares).toContain(square);
    }
  });

  it("finds every UCS-2000 metre square a UTM metre square overlaps after the datum shift", () => {
    const coverage = coveringSquares(areaFor("36U 324182 5591608"), "UCS-2000");
    const squares = values(coverage);
    // A 1 m square shifted and rotated onto another 1 m grid reaches at most four of its squares.
    expect(squares.length).toBeGreaterThanOrEqual(1);
    expect(squares.length).toBeLessThanOrEqual(4);
    expect(squares[0]).toBe("5593954 6324226");
  });

  it("refuses to list more squares than anyone would read", () => {
    const coverage = coveringSquares(areaFor("36UUA"), "MGRS", { precision: 1 });
    expect(coverage).toMatchObject({ kind: "tooMany", primary: { system: "MGRS" } });
    if (coverage.kind === "tooMany") expect(coverage.count).toBeGreaterThan(1e9);
  });

  it("includes the squares of a USNG reference read with its own parser", () => {
    const usng = usngParser.run("36U UA 24 91");
    if (usng.isError) throw new Error(usng.error);
    expect(values(coveringSquares(areaOf(usng.result[0]), "USNG", { precision: 10000 }))).toEqual([
      "36U UA 2 9",
    ]);
  });
});
