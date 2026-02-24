const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInviteEmails(input) {
  const raw = String(input || "");
  const pieces = raw
    .split(/[\n,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(pieces)];
  const validEmails = unique.filter((email) => EMAIL_PATTERN.test(email));
  const invalidEmails = unique.filter((email) => !EMAIL_PATTERN.test(email));

  return {
    validEmails,
    invalidEmails,
  };
}

