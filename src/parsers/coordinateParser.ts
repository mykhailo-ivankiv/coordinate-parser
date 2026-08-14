import { choice } from "arcsecond";
import { EuropeanWGS84parser } from "./EuropeanWGS84parser.ts";
import { EuropeanWGS84Rparser } from "./EuropeanWGS84Rparser.ts";
import { WGS84parser } from "./WGS84parser.ts";
import { WGS84Rparser } from "./WGS84Rparser.ts";
import { MGRSparser } from "./MGRSparser.ts";

// Order matters: the reversed variants only get a turn once the straight ones have
// failed, so an input valid in both orders is read as latitude first.
export const coordinateParser = choice([
  WGS84parser.map((coords) => ({ ...coords, system: "WGS84" })),
  WGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" })),
  EuropeanWGS84parser.map((coords) => ({ ...coords, system: "WGS84" })),
  EuropeanWGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" })),
  MGRSparser.map((coords) => ({ ...coords, system: "MGRS" })),
]);
