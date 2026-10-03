import { describe, expect, it } from "vitest";
import { UTM } from "./coordinateRegex.ts";
import { UTMHemisphereParser } from "./UTMHemisphereParser.ts";
import { type UTMCoordinate, UTMparser } from "./UTMparser.ts";

// Expectations follow NGA.STND.0037_2.0.0_GRIDS (NGA, 2014), which reads the letter after the zone
// number as a latitude band. See the header of UTMparser.ts for the collision with EPSG/PROJ.

const parse = (input: string): UTMCoordinate => {
  const result = UTMparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = UTMparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !UTMparser.run(input).isError;

const kyivZone: UTMCoordinate = {
  zone: 36,
  band: "U",
  hemisphere: "N",
  easting: 324000,
  northing: 5591000,
};

describe("zone and latitude band", () => {
  it("reads zone, band, easting and northing", () => {
    expect(parse("36U 324000 5591000")).toEqual(kyivZone);
  });

  it("accepts the full zone range", () => {
    expect(parse("1T 630084 4833438").zone).toBe(1);
    expect(parse("60T 630084 4833438").zone).toBe(60);
  });

  it("rejects zones outside 1-60", () => {
    expect(errorOf("0T 630084 4833438")).toBe('UTM zone must be between 1 and 60, but got "0"');
    expect(errorOf("61T 630084 4833438")).toBe('UTM zone must be between 1 and 60, but got "61"');
  });

  it.each([..."CDEFGHJKLMNPQRSTUVWX"])("accepts band %s", (band) => {
    expect(parse(`17${band} 630084 4833438`).band).toBe(band);
  });

  it.each(["I", "O"])("rejects band %s, reserved to avoid 1 and 0", (band) => {
    expect(errorOf(`17${band} 630084 4833438`)).toContain("Expecting a latitude band letter");
  });

  // Bands C-M lie south of the equator, N-X north of it, so the band fixes the hemisphere.
  it.each([
    ["C", "S"],
    ["M", "S"],
    ["N", "N"],
    ["T", "N"],
    ["X", "N"],
  ])("band %s puts the point in hemisphere %s", (band, hemisphere) => {
    expect(parse(`17${band} 630084 4833438`).hemisphere).toBe(hemisphere);
  });
});

describe("easting and northing", () => {
  it("requires a six-digit easting", () => {
    expect(errorOf("17T 63008 4833438")).toBe("UTM easting must have 6 digits, but got 5");
    expect(errorOf("17T 6300840 4833438")).toBe("UTM easting must have 6 digits, but got 7");
  });

  it("rejects an easting below the six-digit floor", () => {
    expect(errorOf("17T 099999 4833438")).toBe(
      "UTM easting must be between 100000 and 999999 metres, but got 99999",
    );
  });

  // A northern point near the equator legitimately has fewer than seven digits of northing, which
  // is exactly what the baseline regex cannot express.
  it("accepts a short northing near the equator", () => {
    expect(parse("31N 630084 553000")).toMatchObject({ northing: 553000, hemisphere: "N" });
    expect(parse("31N 630084 0")).toMatchObject({ northing: 0 });
  });

  // 10000000 is the false northing the southern hemisphere counts down from, so it is the one
  // legitimate eight-digit value.
  it("accepts the southern-hemisphere ceiling", () => {
    expect(parse("17M 630084 10000000").northing).toBe(10000000);
  });

  it("rejects a northing past that ceiling", () => {
    expect(errorOf("17T 630084 10000001")).toBe(
      "UTM northing must be between 0 and 10000000 metres, but got 10000001",
    );
    expect(errorOf("17T 630084 48334380")).toBe(
      "UTM northing must be between 0 and 10000000 metres, but got 48334380",
    );
  });

  it("rejects an unbounded run of northing digits", () => {
    expect(errorOf("17T 630084 483343800")).toBe("UTM northing may not exceed 8 digits, but got 9");
  });
});

describe("formatting tolerance", () => {
  const canonical = parse("17T 630084 4833438");

  it.each([
    ["17T630084 4833438", "no space after the band"],
    ["17T 630084,4833438", "comma between the axes"],
    ["17t 630084 4833438", "lowercase"],
    ["  17T 630084 4833438  ", "padding around the input"],
    ["17T6300844833438", "one unbroken run of 13 digits"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(canonical);
  });

  it("rejects an unbroken run that is not 13 digits", () => {
    expect(errorOf("17T 63008448334")).toBe(
      "UTM written without a separator must have 13 digits, 6 of easting and 7 of northing, but got 11",
    );
  });

  it.each(["", "   ", "17T", "17 630084 4833438", "abc", "50.4501, 30.5234", "4QFJ1234567890"])(
    "rejects %j",
    (input) => {
      expect(accepts(input)).toBe(false);
    },
  );
});

// The two conventions collide on exactly two letters, and disagree completely there.
describe("collision with the EPSG hemisphere convention", () => {
  it.each([
    ["17S 630084 3900000", "N", "S"],
    ["17N 630084 4833438", "N", "N"],
  ])("%j is band-hemisphere %s but EPSG-hemisphere %s", (input, byBand, byHemisphere) => {
    expect(parse(input).hemisphere).toBe(byBand);
    const other = UTMHemisphereParser.run(input);
    expect(other.isError).toBe(false);
    if (!other.isError) expect(other.result.hemisphere).toBe(byHemisphere);
  });

  it.each(["17T 630084 4833438", "17M 630084 4833438", "17C 630084 4833438"])(
    "%j is a band reference only — the EPSG convention has no such letter",
    (input) => {
      expect(accepts(input)).toBe(true);
      expect(UTMHemisphereParser.run(input).isError).toBe(true);
    },
  );

  it("the hemisphere reading accepts a strict subset, so order decides in a choice", () => {
    for (const input of ["17N 630084 4833438", "17S 630084 4833438"]) {
      expect(accepts(input)).toBe(true);
      expect(UTMHemisphereParser.run(input).isError).toBe(false);
    }
  });

  it("carries no band, because the string does not name one", () => {
    const result = UTMHemisphereParser.run("17S 630084 4833438");
    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.result.band).toBeUndefined();
  });
});

// The baseline regex accepts any letter and pins the northing at seven digits.
describe("UTM regex baseline", () => {
  it.each([
    ["17I 630084 4833438", "band I is reserved"],
    ["17O 630084 4833438", "band O is reserved"],
    ["0T 630084 4833438", "zone 0 does not exist"],
    ["61T 630084 4833438", "zone 61 does not exist"],
    ["17T 099999 4833438", "easting below the six-digit floor"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(UTM.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it.each([
    ["31N 630084 553000", "a northern northing near the equator has six digits"],
    ["  17T 630084 4833438  ", "surrounding whitespace"],
    ["17T 630084,4833438", "comma between the axes"],
  ])("regex wrongly rejects %j — %s", (input) => {
    expect(UTM.test(input)).toBe(false);
    expect(accepts(input)).toBe(true);
  });

  it.each(["17T 630084 4833438", "17T630084 4833438", "36U 324000 5591000"])(
    "both accept %j",
    (input) => {
      expect(UTM.test(input)).toBe(true);
      expect(accepts(input)).toBe(true);
    },
  );

  it.each(["", "abc", "17T"])("both reject %j", (input) => {
    expect(UTM.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
