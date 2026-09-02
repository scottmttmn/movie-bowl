import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import bowlImage from "../assets/bowl-illustration-v3.webp";

export default function TopNav({
  isSettingsRoute,
  isWatchListRoute = false,
  isInvitesRoute = false,
  isBowlsRoute = false,
  onSignOut,
  onAddMovie,
  userEmail = "",
  isAuthenticated = true,
  pendingInviteCount = 0,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [blockingOverlay, setBlockingOverlay] = useState(false);
  useEffect(() => {
    const update = () => setBlockingOverlay(Boolean(document.querySelector('[aria-modal="true"], [data-blocks-global-add]')));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "data-blocks-global-add"] });
    return () => observer.disconnect();
  }, []);
  const hasPendingInvites = isAuthenticated && pendingInviteCount > 0;
  const pendingInviteLabel = `${pendingInviteCount} pending invite${
    pendingInviteCount === 1 ? "" : "s"
  }`;
  const badgeCount = pendingInviteCount > 9 ? "9+" : pendingInviteCount;

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
          aria-label="Go to your home bowl"
          className="inline-flex items-center gap-2.5 rounded-xl text-lg min-[360px]:text-xl font-semibold tracking-tight text-slate-100 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 sm:text-2xl"
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
        <div className="flex shrink-0 items-center gap-2">
          {isAuthenticated && onAddMovie && <button type="button" className="btn btn-secondary h-11 w-16 gap-1.5 px-2"
            aria-label="Add a movie" title="Add a movie" disabled={blockingOverlay}
            onClick={() => { setIsMenuOpen(false); onAddMovie(); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4m-4 6h4M17 9h4m-4 6h4" /></svg>
          </button>}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label={
              hasPendingInvites
                ? `Navigation menu (${pendingInviteLabel})`
                : "Navigation menu"
            }
            className="icon-btn relative h-10 w-10"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
            {hasPendingInvites && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
              >
                {badgeCount}
              </span>
            )}
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
                    to="/bowls"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white ${
                      isBowlsRoute ? "pointer-events-none bg-slate-800 text-slate-400" : ""
                    }`}
                  >
                    My Bowls
                  </Link>
                  <Link
                    to="/invites"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white ${
                      isInvitesRoute ? "pointer-events-none bg-slate-800 text-slate-400" : ""
                    }`}
                  >
                    <span>Invitations</span>
                    {hasPendingInvites && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-none text-white">
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/watch-list"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white ${
                      isWatchListRoute ? "pointer-events-none bg-slate-800 text-slate-400" : ""
                    }`}
                  >
                    Watch History
                  </Link>
                  <Link
                    to="/tv"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
                  >
                    TV mode
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
      </div>
    </header>
  );
}
