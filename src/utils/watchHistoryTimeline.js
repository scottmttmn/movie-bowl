// The month-and-day calendar Watch History is drawn as. Shared by your own
// page and the page a share link opens, so the two read the same way.

export function getWatchedDate(value) {
  if (!value) return null;

  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getWatchedYears(rows) {
  return [...new Set((rows || []).map((movie) => movie.watchedDate?.getFullYear()).filter(Number.isInteger))].sort(
    (firstYear, secondYear) => secondYear - firstYear
  );
}

/**
 * Groups rows that carry a `watchedDate` into months, then days, keeping the
 * order the rows arrive in. Rows without a date are left out.
 */
export function groupWatchHistoryByMonth(rows) {
  const groups = [];
  const monthMap = new Map();

  (rows || []).forEach((movie) => {
    if (!movie.watchedDate) return;

    const monthKey = `${movie.watchedDate.getFullYear()}-${movie.watchedDate.getMonth()}`;
    let monthGroup = monthMap.get(monthKey);

    if (!monthGroup) {
      monthGroup = {
        key: monthKey,
        label: movie.watchedDate.toLocaleDateString(undefined, { month: "long" }),
        dayGroups: [],
        dayMap: new Map(),
        movieCount: 0,
      };
      monthMap.set(monthKey, monthGroup);
      groups.push(monthGroup);
    }

    const dayKey = getLocalDateKey(movie.watchedDate);
    let dayGroup = monthGroup.dayMap.get(dayKey);

    if (!dayGroup) {
      dayGroup = {
        key: dayKey,
        dateTime: dayKey,
        weekdayLabel: movie.watchedDate.toLocaleDateString(undefined, { weekday: "short" }),
        dayLabel: movie.watchedDate.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        dayNumber: movie.watchedDate.getDate(),
        movies: [],
      };
      monthGroup.dayMap.set(dayKey, dayGroup);
      monthGroup.dayGroups.push(dayGroup);
    }

    dayGroup.movies.push(movie);
    monthGroup.movieCount += 1;
  });

  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    dayGroups: group.dayGroups,
    movieCount: group.movieCount,
  }));
}
