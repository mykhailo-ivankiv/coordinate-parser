import { describe, expectTypeOf, it } from "vitest";
import type {
  CoordinateSystem,
  GridReferenceFormat,
  WGS84Coordinate,
  WGS84Format,
  WrittenCoordinate,
} from "./index.ts";

// Types only: these checks run in the compiler, through `tsc -b`, as much as in vitest.

describe("WrittenCoordinate", () => {
  it("pairs each format with its own system", () => {
    // Compiling is the check: both assignments must type-check.
    const dms: WrittenCoordinate = {
      coordinate: { system: "WGS84", latitude: 50.4501, longitude: 30.5234 },
      format: "DMS",
    };
    const mgrs: WrittenCoordinate = {
      coordinate: {
        system: "MGRS",
        zone: 36,
        band: "U",
        square: "UA",
        easting: 24182,
        northing: 91607,
        precision: 1,
      },
      format: "compact",
    };
    expectTypeOf(dms.format).toEqualTypeOf<WGS84Format>();
    expectTypeOf(mgrs.format).toEqualTypeOf<GridReferenceFormat>();
  });

  it("rejects a format of another system", () => {
    const mgrsWrittenAsDms = {
      coordinate: {
        system: "MGRS",
        zone: 36,
        band: "U",
        square: "UA",
        easting: 24182,
        northing: 91607,
        precision: 1,
      },
      format: "DMS",
    } as const;
    // @ts-expect-error — DMS is a way of writing WGS 84, not MGRS
    const mismatched: WrittenCoordinate = mgrsWrittenAsDms;
    expectTypeOf(mismatched).not.toBeNever();
  });

  // The pair narrows by `format`, its own field. It does not narrow by `coordinate.system`: TypeScript
  // narrows an object by a discriminant of its own, never by one nested a level down.
  it("narrows the coordinate by a format only one system has", () => {
    const read = (written: WrittenCoordinate) =>
      written.format === "DMS" ? written.coordinate : null;
    expectTypeOf(read).returns.toEqualTypeOf<WGS84Coordinate | null>();
  });
});

describe("CoordinateSystem", () => {
  it("lists the systems, not the ways of writing them", () => {
    expectTypeOf<CoordinateSystem>().toEqualTypeOf<
      "WGS84" | "MGRS" | "USNG" | "UTM" | "UCS-2000"
    >();
  });
});
