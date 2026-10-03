import { type Coordinates, MAX_FRACTION_DIGITS } from "../parsers/commonParsers.ts";

// Latitude and longitude leave the converters at the precision the parsers accept: seven decimal
// places, about a centimetre. Anything finer is floating point residue of the projection maths, and
// trimming it keeps a value written to the database identical to the same value typed in by hand.
const scale = 10 ** MAX_FRACTION_DIGITS;

export const toDeclaredPrecision = ({ latitude, longitude }: Coordinates): Coordinates => ({
  // `+ 0` folds a negative zero into a plain one, so the equator does not print as "-0".
  latitude: Math.round(latitude * scale) / scale + 0,
  longitude: Math.round(longitude * scale) / scale + 0,
});
