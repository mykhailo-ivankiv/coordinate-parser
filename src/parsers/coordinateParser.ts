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
import { USNGparser } from "./USNGparser.ts";
import { UTMparser } from "./UTMparser.ts";

// Order matters: the reversed variants only get a turn once the straight ones have
// failed, so an input valid in both orders is read as latitude first.
export const coordinateParser = choice([
  WGS84parser.map((coords) => ({ ...coords, system: "WGS84" as const })),
  WGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" as const })),
  EuropeanWGS84parser.map((coords) => ({ ...coords, system: "WGS84" as const })),
  EuropeanWGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" as const })),
  // Disjoint from the signed notations above: DD requires a hemisphere letter, and disjoint
  // from UTM below, whose eastings always exceed a longitude.
  DDparser.map((coords) => ({ ...coords, system: "DD" as const })),
  // Disjoint from DD and from each other: DDM needs a minute mark, DMS needs a second mark
  // on top of it, and DMS takes whole minutes where DDM takes decimal ones.
  DDMparser.map((coords) => ({ ...coords, system: "DDM" as const })),
  DMSparser.map((coords) => ({ ...coords, system: "DMS" as const })),
  MGRSparser.map((coords) => ({ ...coords, system: "MGRS" as const })),
  UCS2000parser.map((coords) => ({ ...coords, system: "UCS-2000" as const })),
  // The latitude-band reading of UTM, matching MGRS and USNG above. Putting UTMHemisphereParser
  // ahead of this line switches "17N"/"17S" to the EPSG reading; behind it, it never runs, since
  // this parser already accepts every string that one does.
  UTMparser.map((coords) => ({ ...coords, system: "UTM" as const })),
]);

// One parser per system, for when the caller already knows which system the input is in. Unlike the
// `choice` above nothing competes here, so the systems it can never report are reachable: USNG,
// which MGRS claims first, and a WGS84R pair whose longitude would also pass as a latitude.
export const systemParsers = {
  WGS84: choice([WGS84parser, EuropeanWGS84parser]).map((coords) => ({
    ...coords,
    system: "WGS84" as const,
  })),
  WGS84R: choice([WGS84Rparser, EuropeanWGS84Rparser]).map((coords) => ({
    ...coords,
    system: "WGS84R" as const,
  })),
  DD: DDparser.map((coords) => ({ ...coords, system: "DD" as const })),
  DDM: DDMparser.map((coords) => ({ ...coords, system: "DDM" as const })),
  DMS: DMSparser.map((coords) => ({ ...coords, system: "DMS" as const })),
  MGRS: MGRSparser.map((coords) => ({ ...coords, system: "MGRS" as const })),
  USNG: USNGparser.map((coords) => ({ ...coords, system: "USNG" as const })),
  UTM: UTMparser.map((coords) => ({ ...coords, system: "UTM" as const })),
  "UCS-2000": UCS2000parser.map((coords) => ({ ...coords, system: "UCS-2000" as const })),
};
