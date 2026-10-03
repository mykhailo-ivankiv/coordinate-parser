// The shapes the parser, the converter and the formatter share. A coordinate is data alone: where a
// point or square is, in one coordinate system. How it was or will be written is a separate thing,
// its format; a parser reports both, a formatter takes both, and the converter works on the data.

/** The coordinate systems: one datum and, for the grids, one projection or grid each. */
export type CoordinateSystem = "WGS84" | "MGRS" | "USNG" | "UTM" | "UCS-2000";

/** WGS 84 latitude and longitude in decimal degrees; south and west are negative. */
export type WGS84Coordinate = {
  system: "WGS84";
  latitude: number;
  longitude: number;
};

/** An MGRS reference: a square of the UTM grid, located inside a lettered 100 km square. */
export type MGRSCoordinate = {
  system: "MGRS";
  /** UTM zone, 1-60. */
  zone: number;
  /** Latitude band letter, C-X without I and O. */
  band: string;
  /** The 100 km square: column letter, then row letter. */
  square: string;
  /** Metres east of the south-west corner of the 100 km square. */
  easting: number;
  /** Metres north of the south-west corner of the 100 km square. */
  northing: number;
  /** Side of the referenced square in metres: 100000 down to 1. */
  precision: number;
};

/** A USNG reference: the MGRS grid, read on NAD 83; its coarsest square is 10 km. */
export type USNGCoordinate = {
  system: "USNG";
  /** UTM zone, 1-60. */
  zone: number;
  /** Latitude band letter, C-X without I and O. */
  band: string;
  /** The 100 km square: column letter, then row letter. */
  square: string;
  /** Metres east of the south-west corner of the 100 km square. */
  easting: number;
  /** Metres north of the south-west corner of the 100 km square. */
  northing: number;
  /** Side of the referenced square in metres: 10000 down to 1. */
  precision: number;
};

/** A UTM position: zone, hemisphere, and metres east and north within the zone. */
export type UTMCoordinate = {
  system: "UTM";
  /** Zone, 1-60, each 6° of longitude wide. */
  zone: number;
  /** Latitude band letter, present only when the position is written with one. */
  band?: string;
  /** Which false northing applies; taken from the band when one is written. */
  hemisphere: "N" | "S";
  /** Metres east of the zone's false origin; 500000 sits on the central meridian. */
  easting: number;
  /** Metres north of the equator, or south of 10000000 for southern-hemisphere positions. */
  northing: number;
};

/** A UCS-2000 (EPSG:5562-5565) rectangular position over Ukraine. */
export type UCS2000Coordinate = {
  system: "UCS-2000";
  /** Gauss-Kruger zone, 4-7 over Ukraine, written as the leading digit of Y. */
  zone: number;
  /** X, metres north of the equator. */
  northing: number;
  /** Y with the zone prefix removed; 500000 is the central meridian of the zone. */
  easting: number;
};

/** A coordinate in any of the systems. */
export type Coordinate =
  | WGS84Coordinate
  | MGRSCoordinate
  | USNGCoordinate
  | UTMCoordinate
  | UCS2000Coordinate;

// Formats. Each names a way of writing that changes the shape of the text, not a detail inside it:
// a comma or a space between two values, or a decimal comma for a point, is read either way and
// written one way.

/**
 * How WGS 84 is written: signed decimal degrees latitude first ("50.4501, 30.5234") or longitude
 * first ("30.5234, 50.4501"), or with hemisphere letters in decimal degrees, degrees and decimal
 * minutes, or degrees, minutes and seconds (ISO 6709 Annex D).
 */
export type WGS84Format = "decimal" | "decimalLongitudeFirst" | "DD" | "DDM" | "DMS";

/** How an MGRS or USNG reference is written: "4QFJ1234567890" or "4Q FJ 12345 67890". */
export type GridReferenceFormat = "compact" | "spaced";

/** How a UTM position is written: "36U 324182 5591608" or "36U3241825591608". */
export type UTMFormat = "spaced" | "compact";

/** How UCS-2000 is written: "5591000 6325000", or grouped for legibility "55-91000 63-25000". */
export type UCS2000Format = "plain" | "grouped";

/** A coordinate together with how it is written: what a parser returns and a formatter takes. */
export type WrittenCoordinate =
  | { coordinate: WGS84Coordinate; format: WGS84Format }
  | { coordinate: MGRSCoordinate; format: GridReferenceFormat }
  | { coordinate: USNGCoordinate; format: GridReferenceFormat }
  | { coordinate: UTMCoordinate; format: UTMFormat }
  | { coordinate: UCS2000Coordinate; format: UCS2000Format };
