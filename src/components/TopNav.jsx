import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bowlImage from "../assets/bowl-illustration.png";

export default function TopNav({ isSettingsRoute, onSignOut, userEmail = "", isAuthenticated = true }) {
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
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="page-container flex h-16 items-center justify-between">
        <Link
          to="/"
          aria-label="Go to My Bowls"
          className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 rounded"
        >
          <img
            src={bowlImage}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 object-contain"
          />
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
              className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
            >
              {userEmail && (
                <div
                  className="mb-1 truncate rounded-md px-3 py-2 text-sm text-slate-500"
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
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                About
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    to="/"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    My Bowls
                  </Link>
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${
                      isSettingsRoute ? "bg-slate-100 text-slate-500 pointer-events-none" : ""
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
                    className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                >
                  Log in
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
