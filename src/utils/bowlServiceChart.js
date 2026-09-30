import { PAID_STREAMING_SERVICES, normalizeStreamingServices } from "./streamingServices.js";

export const SERVICE_CHART_MIN_ROWS = 8;
export const SERVICE_CHART_MIN_OTHER_ROWS = 3;

const PAID_BY_KEY = new Map(PAID_STREAMING_SERVICES.map((service) => [service.toLowerCase(), service]));
const INCLUDED_GROUPS = ["subscription", "free", "ads"];

// Every service a title streams on, free ones included: they get no bar, but
// a movie you can already watch on Tubi is not one Max would add.
function getStreamingServices(metadata) {
  const availability = metadata?.availability || {};
  const names = INCLUDED_GROUPS.flatMap((group) =>
    (Array.isArray(availability[group]) ? availability[group] : []).map((provider) => provider?.name)
  );
  // Rows cached before availability was grouped carry only the flat list.
  const source = names.length > 0 ? names : metadata?.providers || [];
  return normalizeStreamingServices(source);
}

function toPaid(services) {
  return services.map((name) => PAID_BY_KEY.get(name.toLowerCase())).filter(Boolean);
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
  const titles = Array.from(metadataByTmdbId?.values?.() || []).map(getStreamingServices);
  const ownedKeys = new Set(normalizeStreamingServices(userServices).map((name) => name.toLowerCase()));
  const mine = toPaid(normalizeStreamingServices(userServices));
  const mineSet = new Set(mine);

  const counts = new Map(PAID_STREAMING_SERVICES.map((service) => [service, 0]));
  // Titles on a service that none of the viewer's services carry, free ones
  // included: for a service they lack, these are what they can't watch yet.
  const unwatchable = new Map(PAID_STREAMING_SERVICES.map((service) => [service, 0]));
  titles.forEach((services) => {
    const canWatch = services.some((service) => ownedKeys.has(service.toLowerCase()));
    toPaid(services).forEach((service) => {
      counts.set(service, counts.get(service) + 1);
      if (!canWatch) unwatchable.set(service, unwatchable.get(service) + 1);
    });
  });

  const byCount = (a, b) => b.count - a.count || a.service.localeCompare(b.service);
  // Everything on one of the viewer's own services they can watch.
  const toRow = (service) => {
    const isMine = mineSet.has(service);
    return { service, count: counts.get(service), unwatchableCount: isMine ? 0 : unwatchable.get(service), isMine };
  };
  const mineRows = mine.map(toRow);
  const otherRows = PAID_STREAMING_SERVICES.filter((service) => !mineSet.has(service))
    .map(toRow)
    .filter((row) => row.count > 0)
    .sort(byCount)
    .slice(0, Math.max(SERVICE_CHART_MIN_OTHER_ROWS, SERVICE_CHART_MIN_ROWS - mineRows.length));
  const rows = [...mineRows, ...otherRows].sort(byCount);

  const bestAddition = PAID_STREAMING_SERVICES.filter((service) => !mineSet.has(service))
    .map((service) => ({ service, count: unwatchable.get(service) }))
    .filter((entry) => entry.count > 0)
    .sort(byCount)[0] || null;

  return {
    titleCount: titles.length,
    streamingCount: titles.filter((services) => toPaid(services).length > 0).length,
    // Titles the viewer can already stream, free services included.
    coveredCount: titles.filter((services) => services.some((service) => ownedKeys.has(service.toLowerCase()))).length,
    maxCount: Math.max(0, ...rows.map((row) => row.count)),
    rows,
    bestAddition,
    // Any service counts here, free ones too, so the headline's wording
    // matches the coverage the additions were measured against.
    hasServices: ownedKeys.size > 0,
  };
}
