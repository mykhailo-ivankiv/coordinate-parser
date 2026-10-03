// The parser package's public surface: whatever is exported here is documented on the API page.
export {
  coordinateParser,
  ddmParser,
  ddParser,
  dmsParser,
  latitudeLongitudeParser,
  mgrsParser,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84Parser,
  wgs84rParser,
} from "./coordinateParser.ts";
export type { CoordinateOf, CoordinateSystem, SystemCoordinate } from "./coordinateSystem.ts";
export type { Coordinates } from "./commonParsers.ts";
export type { GridLocation, UTMLocation } from "./gridReference.ts";
export type { MGRSCoordinate } from "./MGRSparser.ts";
export type { USNGCoordinate } from "./USNGparser.ts";
export type { UTMCoordinate } from "./UTMparser.ts";
export type { UCS2000Coordinate } from "./UCS2000parser.ts";
