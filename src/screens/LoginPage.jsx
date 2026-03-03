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
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Login</h2>

      {sent ? (
        <p>Check your email for a magic link.</p>
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
            className="border p-2 rounded"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-black text-white p-2 rounded disabled:opacity-50"
          >
            {isSubmitting ? "Sending..." : "Send Magic Link"}
          </button>
          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}
