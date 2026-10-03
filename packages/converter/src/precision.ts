import type { Coordinates } from "@coordinate-parser/parser";
import { MAX_FRACTION_DIGITS } from "./notation.ts";

// Latitude and longitude leave the converters at the precision the parsers accept: seven decimal
// places, about a centimetre. Anything finer is floating point residue of the projection maths, and
// trimming it keeps a value written to the database identical to the same value typed in by hand.
const scale = 10 ** MAX_FRACTION_DIGITS;

/**
 * Rounds latitude and longitude to the seven decimal places the parsers accept.
 *
 * @param coords - The point to round.
 * @returns The point at about a centimetre.
 */
export const toDeclaredPrecision = (coords: Coordinates): Coordinates => ({
  // `+ 0` folds a negative zero into a plain one, so the equator does not print as "-0".
  latitude: Math.round(coords.latitude * scale) / scale + 0,
  longitude: Math.round(coords.longitude * scale) / scale + 0,
});
