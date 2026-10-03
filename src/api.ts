// The library's public surface, and the entry point the API page is generated from: whatever is
// exported here is documented there, and nothing else is.
export {
  coordinateParser,
  latitudeLongitudeParser,
  systemParsers,
} from "./parsers/coordinateParser.ts";
export * from "./converters/coordinateConverter.ts";
export type { CoordinateOf } from "./parsers/coordinateParser.ts";
export type { Coordinates } from "./parsers/commonParsers.ts";
export type { GridLocation, UTMLocation } from "./parsers/gridReference.ts";
export type { MGRSCoordinate } from "./parsers/MGRSparser.ts";
export type { USNGCoordinate } from "./parsers/USNGparser.ts";
export type { UTMCoordinate } from "./parsers/UTMparser.ts";
export type { UCS2000Coordinate } from "./parsers/UCS2000parser.ts";
