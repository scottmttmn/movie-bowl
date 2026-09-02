import { useEffect, useState } from "react";

// Shared by Bowl Settings add links and the Invitations hub. The copied state is
// local and self-clearing so callers do not have to manage a transient label.
export default function CopyButton({ value, label = "Copy", ariaLabel, onCopied }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="btn btn-secondary px-3 py-1.5 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          onCopied?.();
        } catch (err) {
          console.error("[CopyButton] Failed to copy", err);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
