const FALLBACK_TIME_ZONE = "UTC";

export function getBrowserTimeZone(dateTimeFormat = Intl.DateTimeFormat) {
  try {
    const timeZone = dateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.trim()
      ? timeZone.trim()
      : FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}
