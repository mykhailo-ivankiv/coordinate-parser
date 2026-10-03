import type { Coordinates } from "@coordinate-parser/parser";
import type { Ellipsoid } from "./ellipsoid.ts";

// Transverse Mercator in Krüger's series to sixth order in n, as given by C. F. F. Karney,
// "Transverse Mercator with an accuracy of a few nanometers", J. Geodesy 85 (2011) 475-485 —
// https://arxiv.org/abs/1002.1417. The same formulation backs PROJ's `tmerc` and Chris Veness's
// geodesy library, and stays accurate to nanometres well beyond the width of a UTM zone.
//
// UTM and Gauss-Kruger are both this projection; they differ only in the parameters: UTM scales the
// central meridian by 0.9996, Gauss-Kruger keeps it true (1), and each picks its own false origin.

export type Projection = {
  ellipsoid: Ellipsoid;
  /** Longitude of the central meridian, degrees. */
  centralMeridian: number;
  /** Scale factor on the central meridian. */
  scale: number;
  falseEasting: number;
  falseNorthing: number;
};

export type Projected = { easting: number; northing: number };

const series = ({ f }: Ellipsoid) => {
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const n5 = n4 * n;
  const n6 = n5 * n;

  return {
    e: Math.sqrt(f * (2 - f)),
    // Radius of the rectifying sphere, divided by the semi-major axis.
    A: (1 + n2 / 4 + n4 / 64 + n6 / 256) / (1 + n),
    α: [
      n / 2 -
        (2 / 3) * n2 +
        (5 / 16) * n3 +
        (41 / 180) * n4 -
        (127 / 288) * n5 +
        (7891 / 37800) * n6,
      (13 / 48) * n2 -
        (3 / 5) * n3 +
        (557 / 1440) * n4 +
        (281 / 630) * n5 -
        (1983433 / 1935360) * n6,
      (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
      (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
      (34729 / 80640) * n5 - (3418889 / 1995840) * n6,
      (212378941 / 319334400) * n6,
    ],
    β: [
      n / 2 -
        (2 / 3) * n2 +
        (37 / 96) * n3 -
        (1 / 360) * n4 -
        (81 / 512) * n5 +
        (96199 / 604800) * n6,
      (1 / 48) * n2 +
        (1 / 15) * n3 -
        (437 / 1440) * n4 +
        (46 / 105) * n5 -
        (1118711 / 3870720) * n6,
      (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
      (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
      (4583 / 161280) * n5 - (108847 / 3991680) * n6,
      (20648693 / 638668800) * n6,
    ],
  };
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

// Zone 1 reaches west of its central meridian, -177°, across the antimeridian, so a point there
// comes back as -180.0000032° — not a longitude, and one our own parsers would reject. Folding it
// into -180..180 gives 179.9999968°, the same place.
const wrapLongitude = (longitude: number) =>
  longitude < -180 ? longitude + 360 : longitude > 180 ? longitude - 360 : longitude;

// τ′, the tangent of the conformal latitude, from τ, the tangent of the geodetic one.
const conformal = (τ: number, e: number) => {
  const σ = Math.sinh(e * Math.atanh((e * τ) / Math.sqrt(1 + τ * τ)));
  return τ * Math.sqrt(1 + σ * σ) - σ * Math.sqrt(1 + τ * τ);
};

export const project = (
  { latitude, longitude }: Coordinates,
  { ellipsoid, centralMeridian, scale, falseEasting, falseNorthing }: Projection,
): Projected => {
  const { e, A, α } = series(ellipsoid);
  const λ = toRadians(longitude - centralMeridian);
  const τʹ = conformal(Math.tan(toRadians(latitude)), e);

  const ξʹ = Math.atan2(τʹ, Math.cos(λ));
  const ηʹ = Math.asinh(Math.sin(λ) / Math.hypot(τʹ, Math.cos(λ)));

  let ξ = ξʹ;
  let η = ηʹ;
  α.forEach((αj, index) => {
    const j2 = 2 * (index + 1);
    ξ += αj * Math.sin(j2 * ξʹ) * Math.cosh(j2 * ηʹ);
    η += αj * Math.cos(j2 * ξʹ) * Math.sinh(j2 * ηʹ);
  });

  const k = scale * A * ellipsoid.a;
  return { easting: falseEasting + k * η, northing: falseNorthing + k * ξ };
};

export const unproject = (
  { easting, northing }: Projected,
  { ellipsoid, centralMeridian, scale, falseEasting, falseNorthing }: Projection,
): Coordinates => {
  const { e, A, β } = series(ellipsoid);
  const k = scale * A * ellipsoid.a;
  const ξ = (northing - falseNorthing) / k;
  const η = (easting - falseEasting) / k;

  let ξʹ = ξ;
  let ηʹ = η;
  β.forEach((βj, index) => {
    const j2 = 2 * (index + 1);
    ξʹ -= βj * Math.sin(j2 * ξ) * Math.cosh(j2 * η);
    ηʹ -= βj * Math.cos(j2 * ξ) * Math.sinh(j2 * η);
  });

  const τʹ = Math.sin(ξʹ) / Math.hypot(Math.sinh(ηʹ), Math.cos(ξʹ));

  // Newton-Raphson back from the conformal latitude; converges in two or three steps.
  const e2 = e * e;
  let τ = τʹ;
  for (let step = 0; step < 10; step++) {
    const τiʹ = conformal(τ, e);
    const δτ =
      ((τʹ - τiʹ) / Math.sqrt(1 + τiʹ * τiʹ)) *
      ((1 + (1 - e2) * τ * τ) / ((1 - e2) * Math.sqrt(1 + τ * τ)));
    τ += δτ;
    if (Math.abs(δτ) < 1e-12) break;
  }

  return {
    latitude: toDegrees(Math.atan(τ)),
    longitude: wrapLongitude(centralMeridian + toDegrees(Math.atan2(Math.sinh(ηʹ), Math.cos(ξʹ)))),
  };
};
