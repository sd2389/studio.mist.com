/** The largest id a Postgres `integer` column holds. */
const MAX_ID = 2_147_483_647;

/** A route's id segment as a database id: a whole number from 1 up, else null. */
export function parseRouteId(segment: string): number | null {
  if (!/^\d+$/.test(segment)) return null;
  const id = Number(segment);
  return id >= 1 && id <= MAX_ID ? id : null;
}
