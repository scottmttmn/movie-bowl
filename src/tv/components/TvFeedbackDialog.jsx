import { useEffect, useState } from "react";
import QRCode from "qrcode";

// A television has no keyboard worth typing feedback on, so it hands the sheet
// to a phone: the code opens the web app's own feedback sheet, marked as being
// about the TV. Back closes it through the picker's own navigation hook.
function getTvFeedbackUrl(origin = window.location.origin) {
  return `${origin}/bowls?feedback=tv`;
}

export default function TvFeedbackDialog({ onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(getTvFeedbackUrl(), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 360,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("[TvFeedbackDialog] Failed to render QR code", error);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="tv-dialog-backdrop" role="presentation">
      <section className="tv-dialog tv-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-feedback-title">
        <h2 id="tv-feedback-title">Feedback</h2>
        <div className="tv-feedback-qr">
          {qrDataUrl && <img src={qrDataUrl} alt="QR code that opens feedback on your phone" />}
        </div>
        <div className="tv-dialog-actions tv-feedback-actions">
          <button
            type="button"
            className="tv-button tv-button-secondary"
            data-tv-focusable
            data-tv-autofocus="true"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
