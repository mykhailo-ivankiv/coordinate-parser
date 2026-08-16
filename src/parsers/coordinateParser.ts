import { choice } from "arcsecond";
import { EuropeanWGS84parser } from "./EuropeanWGS84parser.ts";
import { EuropeanWGS84Rparser } from "./EuropeanWGS84Rparser.ts";
import { WGS84parser } from "./WGS84parser.ts";
import { WGS84Rparser } from "./WGS84Rparser.ts";
import { DDMparser } from "./DDMparser.ts";
import { DDparser } from "./DDparser.ts";
import { DMSparser } from "./DMSparser.ts";
import { MGRSparser } from "./MGRSparser.ts";
import { UCS2000parser } from "./UCS2000parser.ts";
import { UTMparser } from "./UTMparser.ts";

// Order matters: the reversed variants only get a turn once the straight ones have
// failed, so an input valid in both orders is read as latitude first.
export const coordinateParser = choice([
  WGS84parser.map((coords) => ({ ...coords, system: "WGS84" })),
  WGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" })),
  EuropeanWGS84parser.map((coords) => ({ ...coords, system: "WGS84" })),
  EuropeanWGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" })),
  // Disjoint from the signed notations above: DD requires a hemisphere letter, and disjoint
  // from UTM below, whose eastings always exceed a longitude.
  DDparser.map((coords) => ({ ...coords, system: "DD" })),
  // Disjoint from DD and from each other: DDM needs a minute mark, DMS needs a second mark
  // on top of it, and DMS takes whole minutes where DDM takes decimal ones.
  DDMparser.map((coords) => ({ ...coords, system: "DDM" })),
  DMSparser.map((coords) => ({ ...coords, system: "DMS" })),
  MGRSparser.map((coords) => ({ ...coords, system: "MGRS" })),
  UCS2000parser.map((coords) => ({ ...coords, system: "UCS-2000" })),
  // The latitude-band reading of UTM, matching MGRS and USNG above. Putting UTMHemisphereParser
  // ahead of this line switches "17N"/"17S" to the EPSG reading; behind it, it never runs, since
  // this parser already accepts every string that one does.
  UTMparser.map((coords) => ({ ...coords, system: "UTM" })),
]);
