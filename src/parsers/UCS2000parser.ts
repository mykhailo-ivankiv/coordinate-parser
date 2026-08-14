import {
  anyOfString,
  char,
  digits,
  fail,
  type Parser,
  possibly,
  sequenceOf,
  succeedWith,
} from "arcsecond";
import { commaOrWhitespace, wholeInput } from "./commonParsers.ts";

// UCS-2000 (УСК-2000) — the state geodetic reference coordinate system of Ukraine, rectangular
// coordinates in the Gauss-Kruger projection on the Krassowsky 1940 ellipsoid.
//
// Establishing act — Постанова КМУ від 22.09.2004 № 1259 "Деякі питання застосування геодезичної
//   системи координат", mandatory for topographic, geodetic and cartographic work from 1 Jan 2007,
//   replacing СК-42 and СК-63. https://www.kmu.gov.ua/npas/9103399
//
// Geodesy — EPSG:5561 (UCS-2000, datum Ukraine 2000) https://epsg.io/5561
//           EPSG:5562-5565 (UCS-2000 / Gauss-Kruger zones 4-7) https://epsg.io/5564
//   Zone CRSs carry false easting = zone * 1000000 + 500000 (zone 6 → 6500000), which is where the
//   convention below comes from: the zone number is the leading digit of Y, the remaining six
//   digits are the easting, offset so that 500000 sits on the central meridian.
//
// Write format — "Довідник з військової топографії" (ЗСУ)
//   https://sprotyvg7.com.ua/wp-content/uploads/2024/02/topo_red_15_%D1%81%D1%96%D1%87%D0%B5%D0%BD%D1%8C_2023.pdf
//   Worked example: Х = 60 80км + 600м = 60 80 600; Y = 43 08км + 1 700м = 43 09 700
//
//   5591000 6325000
//   ^^^^^^^ X, metres north of the equator
//           ^ zone 6
//            ^^^^^^ easting within the zone
//
// Ukraine spans 22.15°E to 40.18°E, so only the four 6° zones 4-7 apply and Y is always seven
// digits. Only the full form is parsed: the abbreviated combat form (five digits per axis) drops
// the zone and the hundreds of kilometres, so it repeats every 100 km and cannot name a point.

const NORTHING_DIGITS = 7;
const EASTING_DIGITS = 6;
const MIN_ZONE = 4;
const MAX_ZONE = 7;

export type UCS2000Coordinate = {
  /** Gauss-Kruger zone, 4-7 over Ukraine, taken from the leading digit of Y. */
  zone: number;
  /** X, metres north of the equator. */
  northing: number;
  /** Y with the zone prefix removed; 500000 is the central meridian of the zone. */
  easting: number;
};

// Values are conventionally grouped for legibility ("55-91000"). The hyphen is a separator, not a
// sign, so it is captured and dropped rather than fed to Number.
const groupedDigits = sequenceOf([
  possibly(anyOfString("+-")),
  digits,
  possibly(sequenceOf([char("-"), digits])),
]).map(([sign, head, tail]) => ({
  negative: sign === "-",
  value: `${head}${tail === null ? "" : tail[1]}`,
}));

type GroupedDigits = { negative: boolean; value: string };

// Captured as raw syntax first and checked afterwards, so a wrong digit count reports itself
// instead of surfacing as a confusing separator or end-of-input error further along.
const northing = groupedDigits.chain((captured?: GroupedDigits): Parser<number> => {
  if (captured === undefined) return fail("Expecting a UCS-2000 northing");

  const { negative, value } = captured;
  return value.length === NORTHING_DIGITS
    ? succeedWith(negative ? -Number(value) : Number(value))
    : fail(`UCS-2000 northing must have ${NORTHING_DIGITS} digits, but got ${value.length}`);
});

const zonedEasting = groupedDigits.chain(
  (captured?: GroupedDigits): Parser<Pick<UCS2000Coordinate, "zone" | "easting">> => {
    if (captured === undefined) return fail("Expecting a UCS-2000 easting");

    const { negative, value } = captured;
    if (negative) {
      return fail("UCS-2000 easting carries a zone prefix and cannot be negative");
    }

    if (value.length !== EASTING_DIGITS + 1) {
      return fail(
        `UCS-2000 easting must be a zone digit followed by ${EASTING_DIGITS} digits, so ${
          EASTING_DIGITS + 1
        } digits in total, but got ${value.length}`,
      );
    }

    const zone = Number(value.slice(0, 1));
    return zone >= MIN_ZONE && zone <= MAX_ZONE
      ? succeedWith({ zone, easting: Number(value.slice(1)) })
      : fail(
          `UCS-2000 zone must be between ${MIN_ZONE} and ${MAX_ZONE}, the zones covering Ukraine, but got "${zone}"`,
        );
  },
);

export const UCS2000parser = wholeInput(
  sequenceOf([northing, commaOrWhitespace, zonedEasting]).map(
    ([north, , east]): UCS2000Coordinate => ({
      zone: east.zone,
      northing: north,
      easting: east.easting,
    }),
  ),
);
