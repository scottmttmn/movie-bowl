import { useState } from "react";
import { useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import bowlImage from "../assets/bowl-illustration-v3.png";

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
    <div className="page-container flex min-h-screen items-center py-10">
      <div className="page-hero mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <img src={bowlImage} alt="" aria-hidden="true" className="h-16 w-16 object-contain" />
        </div>
        <p className="eyebrow text-rose-300">Movie Bowl</p>
        <h1 className="mb-5 mt-2 text-3xl font-semibold tracking-tight text-slate-50">Login</h1>

        {sent ? (
          <p className="status-success text-left">Check your email for a magic link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
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
              <p className="status-error">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
