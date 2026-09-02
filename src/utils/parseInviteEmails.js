const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInviteEmails(input) {
  const raw = String(input || "");
  const pieces = raw
    // Commas, new lines, or plain spaces -- an address cannot contain one, and
    // the invite form tells people all three work.
    .split(/[\s,]+/)
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

