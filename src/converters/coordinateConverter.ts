import type { Coordinates } from "../parsers/commonParsers.ts";
import type { MGRSCoordinate } from "../parsers/MGRSparser.ts";
import type { UCS2000Coordinate } from "../parsers/UCS2000parser.ts";
import type { USNGCoordinate } from "../parsers/USNGparser.ts";
import type { UTMCoordinate } from "../parsers/UTMparser.ts";
import { formatMGRS, formatUSNG, fromMGRS, toMGRS, toUSNG } from "./MGRSconverter.ts";
import { toDeclaredPrecision } from "./precision.ts";
import { formatDD, formatDDM, formatDMS, formatWGS84, formatWGS84R } from "./sexagesimalFormat.ts";
import { formatUCS2000, fromUCS2000, toUCS2000 } from "./UCS2000converter.ts";
import { formatUTM, fromUTM, toUTM } from "./UTMconverter.ts";

// WGS 84 latitude/longitude is the pivot: every supported system converts to it and from it, and
// it is the form coordinates are stored in. Converting between any two other systems is the two
// halves chained, `fromWGS84(toWGS84(parsed), system)`.

/** What coordinateParser produces, keyed by the `system` it reports. */
export type SystemCoordinate =
  | (Coordinates & { system: "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS" })
  | (MGRSCoordinate & { system: "MGRS" })
  | (USNGCoordinate & { system: "USNG" })
  | (UTMCoordinate & { system: "UTM" })
  | (UCS2000Coordinate & { system: "UCS-2000" });

export type CoordinateSystem = SystemCoordinate["system"];

/** Any parsed coordinate to WGS 84 latitude/longitude. Throws a RangeError on an impossible value. */
export const toWGS84 = (parsed: SystemCoordinate): Coordinates => {
  switch (parsed.system) {
    case "WGS84":
    case "WGS84R":
    case "DD":
    case "DDM":
    case "DMS":
      return toDeclaredPrecision(parsed);
    case "MGRS":
    case "USNG":
      return fromMGRS(parsed);
    case "UTM":
      return fromUTM(parsed);
    case "UCS-2000":
      return fromUCS2000(parsed);
  }
};

const formatters: Record<CoordinateSystem, (coords: Coordinates) => string> = {
  WGS84: formatWGS84,
  WGS84R: formatWGS84R,
  DD: formatDD,
  DDM: formatDDM,
  DMS: formatDMS,
  MGRS: (coords) => formatMGRS(toMGRS(coords)),
  USNG: (coords) => formatUSNG(toUSNG(coords)),
  UTM: (coords) => formatUTM(toUTM(coords)),
  "UCS-2000": (coords) => formatUCS2000(toUCS2000(coords)),
};

export const CONVERTIBLE_SYSTEMS = Object.keys(formatters) as CoordinateSystem[];

/**
 * WGS 84 latitude/longitude written in `system`, in a form coordinateParser reads back. Throws a
 * RangeError where the system does not reach the point: UTM, MGRS and USNG stop short of the
 * poles, and UCS-2000 is defined over Ukraine only.
 */
export const fromWGS84 = (coords: Coordinates, system: CoordinateSystem): string =>
  formatters[system](toDeclaredPrecision(coords));

export type Conversion =
  | { system: CoordinateSystem; value: string }
  | { system: CoordinateSystem; error: string };

/** The point in every supported system, with the reason wherever one cannot express it. */
export const toAllSystems = (coords: Coordinates): Conversion[] =>
  CONVERTIBLE_SYSTEMS.map((system) => {
    try {
      return { system, value: fromWGS84(coords, system) };
    } catch (error) {
      if (error instanceof RangeError) return { system, error: error.message };
      throw error;
    }
  });
