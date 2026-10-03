// The parser package's public surface: whatever is exported here is documented on the API page.
export { coordinateParser, latitudeLongitudeParser, systemParsers } from "./coordinateParser.ts";
export type { CoordinateOf, CoordinateSystem, SystemCoordinate } from "./coordinateSystem.ts";
export { type Coordinates, MAX_FRACTION_DIGITS } from "./commonParsers.ts";
export {
  COLUMN_LETTERS,
  type GridLocation,
  LATITUDE_BANDS,
  MAX_DIGITS_PER_AXIS,
  ROW_LETTERS,
  type UTMLocation,
} from "./gridReference.ts";
export type { MGRSCoordinate } from "./MGRSparser.ts";
export type { USNGCoordinate } from "./USNGparser.ts";
export type { UTMCoordinate } from "./UTMparser.ts";
export type { UCS2000Coordinate } from "./UCS2000parser.ts";
export { DEGREE_SIGN } from "./sexagesimal.ts";
