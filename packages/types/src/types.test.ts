import { describe, expectTypeOf, it } from "vitest";
import type { CoordinateSystem } from "./index.ts";

// Types only: these checks run in the compiler, through `tsc -b`, as much as in vitest.

describe("CoordinateSystem", () => {
  it("lists the systems, not the ways of writing them", () => {
    expectTypeOf<CoordinateSystem>().toEqualTypeOf<
      "WGS84" | "MGRS" | "USNG" | "UTM" | "UCS-2000"
    >();
  });
});
