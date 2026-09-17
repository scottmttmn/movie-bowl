export const DISPLAY_NAME_MAX_LENGTH = 40;

export function normalizeDisplayName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function getDisplayNameValidationError(value) {
  const normalized = normalizeDisplayName(value);
  if (!normalized) return "Enter the name people in your bowls should see.";
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

function getAnonymousMemberSuffix(userId) {
  const compact = String(userId || "").replace(/[^a-z0-9]/gi, "");
  return compact ? compact.slice(-4).toUpperCase() : "";
}

export function getProfileDisplayName(profile, userId, fallback = "Member") {
  const displayName = normalizeDisplayName(profile?.display_name);
  if (displayName) return displayName;

  const suffix = getAnonymousMemberSuffix(userId);
  return suffix ? `${fallback} ${suffix}` : fallback;
}

export function getDisplayInitial(label) {
  const normalized = normalizeDisplayName(label);
  return normalized ? Array.from(normalized)[0].toLocaleUpperCase() : "M";
}
