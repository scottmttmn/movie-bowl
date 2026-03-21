import { useState } from "react";
import { useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";

export default function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const from = location.state?.from;
  const redirectTo = from?.pathname
    ? `${window.location.origin}${from.pathname}${from.search || ""}${from.hash || ""}`
    : window.location.origin;

  // Submit the email to Supabase Auth to send a magic link.
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent double submissions
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn(email, redirectTo);

      if (error) {
        setErrorMessage(error.message || "Failed to send magic link.");
        return;
      }

      setSent(true);
    } catch (err) {
      setErrorMessage("Unexpected error sending magic link.");
      console.error("[LoginPage] signIn failed", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container py-8">
      <div className="panel mx-auto max-w-md">
        <h2 className="mb-4 text-2xl font-semibold text-slate-100">Login</h2>

        {sent ? (
          <p className="text-base text-slate-200">Check your email for a magic link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              id="login-email"
              name="email"
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send Magic Link"}
            </button>
            {errorMessage && (
              <p className="text-sm text-red-400">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
