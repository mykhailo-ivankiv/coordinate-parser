// The parser package's public surface: whatever is exported here is documented on the API page.
// The types the parsers return live in @coordinate-parser/types.
export {
  coordinateParser,
  mgrsParser,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84Parser,
} from "./coordinateParser.ts";
