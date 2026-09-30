import { PAID_STREAMING_SERVICES, normalizeStreamingServices } from "./streamingServices.js";

export const SERVICE_CHART_MIN_ROWS = 8;
export const SERVICE_CHART_MIN_OTHER_ROWS = 3;

const PAID_BY_KEY = new Map(PAID_STREAMING_SERVICES.map((service) => [service.toLowerCase(), service]));
const INCLUDED_GROUPS = ["subscription", "ads"];

function getPaidServices(metadata) {
  const availability = metadata?.availability || {};
  const names = INCLUDED_GROUPS.flatMap((group) =>
    (Array.isArray(availability[group]) ? availability[group] : []).map((provider) => provider?.name)
  );
  // Rows cached before availability was grouped carry only the flat list.
  const source = names.length > 0 ? names : metadata?.providers || [];
  return normalizeStreamingServices(source)
    .map((name) => PAID_BY_KEY.get(name.toLowerCase()))
    .filter(Boolean);
}

/**
 * Which paid services carry the movies left in a bowl, from the viewer's side.
 * Counts titles, never chances of being drawn: under person-first a title's
 * count says nothing about how likely it is to come up.
 *
 * Every service the viewer pays for gets a row, even at zero, so a service
 * carrying nothing here is visible rather than missing. The rest of the rows
 * go to the best services they lack: enough to reach eight, never fewer than
 * three.
 */
export function buildBowlServiceChart({ metadataByTmdbId, userServices = [] }) {
  const titles = Array.from(metadataByTmdbId?.values?.() || []).map(getPaidServices);
  const mine = normalizeStreamingServices(userServices)
    .map((name) => PAID_BY_KEY.get(name.toLowerCase()))
    .filter(Boolean);
  const mineSet = new Set(mine);

  const counts = new Map(PAID_STREAMING_SERVICES.map((service) => [service, 0]));
  // What a service adds: titles on it that none of the viewer's other
  // services carry. For a service they lack, that is what subscribing gains;
  // for one they have, it is what cancelling would lose.
  const adds = new Map(PAID_STREAMING_SERVICES.map((service) => [service, 0]));
  titles.forEach((services) => {
    const minePresent = services.filter((service) => mineSet.has(service));
    services.forEach((service) => {
      counts.set(service, counts.get(service) + 1);
      const others = minePresent.filter((owned) => owned !== service);
      if (others.length === 0) adds.set(service, adds.get(service) + 1);
    });
  });

  const byCount = (a, b) => b.count - a.count || a.service.localeCompare(b.service);
  const toRow = (service) => ({ service, count: counts.get(service), isMine: mineSet.has(service) });
  const mineRows = mine.map(toRow);
  const otherRows = PAID_STREAMING_SERVICES.filter((service) => !mineSet.has(service))
    .map(toRow)
    .filter((row) => row.count > 0)
    .sort(byCount)
    .slice(0, Math.max(SERVICE_CHART_MIN_OTHER_ROWS, SERVICE_CHART_MIN_ROWS - mineRows.length));
  const rows = [...mineRows, ...otherRows].sort(byCount);

  const bestAddition = PAID_STREAMING_SERVICES.filter((service) => !mineSet.has(service))
    .map((service) => ({ service, count: adds.get(service) }))
    .filter((entry) => entry.count > 0)
    .sort(byCount)[0] || null;
  const idleServices = mine.filter((service) => counts.get(service) > 0 && adds.get(service) === 0);

  return {
    titleCount: titles.length,
    streamingCount: titles.filter((services) => services.length > 0).length,
    maxCount: Math.max(0, ...rows.map((row) => row.count)),
    rows,
    bestAddition,
    idleServices,
    hasServices: mine.length > 0,
  };
}
