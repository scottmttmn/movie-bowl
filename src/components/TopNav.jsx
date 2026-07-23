import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bowlImage from "../assets/bowl-illustration-v3.png";

export default function TopNav({
  isSettingsRoute,
  isWatchListRoute = false,
  onSignOut,
  userEmail = "",
  isAuthenticated = true,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800/80 bg-slate-950/88 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="page-container flex h-16 items-center justify-between">
        <Link
          to="/"
          aria-label="Go to My Bowls"
          className="inline-flex items-center gap-2.5 rounded-xl text-xl font-semibold tracking-tight text-slate-100 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 sm:text-2xl"
        >
          <span className="flex h-9 w-9 items-center justify-center">
            <img
              src={bowlImage}
              alt=""
              aria-hidden="true"
              className="h-8 w-8 object-contain"
            />
          </span>
          Movie Bowl
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label="Navigation menu"
            className="icon-btn h-10 w-10"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              {userEmail && (
                <div
                  className="mb-1 truncate border-b border-slate-800 px-3 py-2.5 text-xs text-slate-400"
                  title={userEmail}
                  aria-label={`Signed in as ${userEmail}`}
                >
                  {userEmail}
                </div>
              )}
              <Link
                to="/about"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                About
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    to="/"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
                  >
                    My Bowls
                  </Link>
                  <Link
                    to="/watch-list"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white ${
                      isWatchListRoute ? "pointer-events-none bg-slate-800 text-slate-400" : ""
                    }`}
                  >
                    Watch List
                  </Link>
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white ${
                      isSettingsRoute ? "pointer-events-none bg-slate-800 text-slate-400" : ""
                    }`}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut?.();
                    }}
                    className="mt-1 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-950/60 hover:text-rose-200"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  className="mt-1 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-950/60 hover:text-rose-200"
                >
                  Log in
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
