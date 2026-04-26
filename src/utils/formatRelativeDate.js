const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatRelativeDateLabel(value, now = new Date()) {
  if (!value) return null;

  const targetDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(targetDate.getTime())) return null;

  const currentDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(currentDate.getTime())) {
    return SHORT_DATE_FORMATTER.format(targetDate);
  }

  const dayDifference = Math.round(
    (startOfDay(targetDate).getTime() - startOfDay(currentDate).getTime()) / 86_400_000
  );

  if (dayDifference === 0) return "Today";
  if (dayDifference === -1) return "Yesterday";
  if (dayDifference === 1) return "Tomorrow";

  return SHORT_DATE_FORMATTER.format(targetDate);
}
