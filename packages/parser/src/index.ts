// The parser package's public surface: whatever is exported here is documented on the API page.
// The types the parsers return live in @coordinate-toolkit/types.
export {
  coordinateParser,
  mgrsParser,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84ddmParser,
  wgs84ddParser,
  wgs84dmsParser,
  wgs84Parser,
  wgs84rParser,
} from "./coordinateParser.ts";
