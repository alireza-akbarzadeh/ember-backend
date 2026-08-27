import { sql, type SQL } from 'drizzle-orm';
import { restaurants } from '../../database/schema/restaurants';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LATITUDE = 111.045;

/**
 * A square that certainly contains every point within `radiusKm`.
 *
 * This is the cheap prefilter: `latitude BETWEEN ? AND ?` uses the composite
 * index, where the trigonometry below cannot. It over-selects at the corners —
 * the exact distance filter runs afterwards and discards those.
 */
export function boundingBox(centre: Coordinates, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LATITUDE;

  // Lines of longitude converge toward the poles, so a kilometre east is more
  // degrees the further north you are. cos() approaches 0 at the pole, which
  // would make the box infinitely wide — cap it at the whole globe instead.
  const shrink = Math.cos((centre.latitude * Math.PI) / 180);
  const lngDelta =
    Math.abs(shrink) < 1e-6
      ? 180
      : Math.min(180, radiusKm / (KM_PER_DEGREE_LATITUDE * Math.abs(shrink)));

  return {
    minLat: centre.latitude - latDelta,
    maxLat: centre.latitude + latDelta,
    minLng: centre.longitude - lngDelta,
    maxLng: centre.longitude + lngDelta,
  };
}

/**
 * Great-circle distance in kilometres, as a SQL expression.
 *
 * `least`/`greatest` clamp the cosine into [-1, 1]: floating point can push it
 * a hair outside for two points that are essentially identical, and `acos` of
 * 1.0000000000000002 is a domain error that would fail the whole query.
 */
export function distanceKmSql(centre: Coordinates): SQL<number> {
  return sql<number>`(
    ${EARTH_RADIUS_KM} * acos(least(1, greatest(-1,
      cos(radians(${centre.latitude})) * cos(radians(${restaurants.latitude}))
        * cos(radians(${restaurants.longitude}) - radians(${centre.longitude}))
      + sin(radians(${centre.latitude})) * sin(radians(${restaurants.latitude}))
    )))
  )`;
}

/**
 * How many ratings before a restaurant's own average is trusted outright, and
 * what to assume until then. Tuned to be forgiving: a genuinely good new
 * restaurant climbs after a couple of dozen reviews.
 */
const PRIOR_WEIGHT = 20;
const PRIOR_MEAN = 4.2;

/**
 * Bayesian-smoothed rating, as a SQL expression.
 *
 * Sorting on the raw average puts a single five-star review above a restaurant
 * with four hundred at 4.8 — the top of the list becomes whoever has the least
 * evidence. This pulls sparse ratings toward the global mean in proportion to
 * how little is known, so confidence has to be earned.
 */
export function rankingScoreSql(): SQL<number> {
  return sql<number>`(
    (${restaurants.ratingCount}::float / (${restaurants.ratingCount} + ${PRIOR_WEIGHT}))
      * ${restaurants.ratingAverage}
    + (${PRIOR_WEIGHT}::float / (${restaurants.ratingCount} + ${PRIOR_WEIGHT}))
      * ${PRIOR_MEAN}
  )`;
}

/**
 * Escapes a user's search text for a LIKE pattern.
 *
 * Without this, someone typing `%` matches every restaurant and `_` matches any
 * character — not a security hole, but search that quietly stops working.
 */
export function likePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
