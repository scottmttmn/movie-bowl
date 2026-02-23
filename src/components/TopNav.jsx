import { Link } from "react-router-dom";

export default function TopNav({ isSettingsRoute, onSignOut }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <div className="text-sm font-semibold tracking-wide text-gray-700">Movie Bowl</div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition ${
              isSettingsRoute
                ? "pointer-events-none bg-gray-100 text-gray-500"
                : "hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.591 1.066c1.527-.94 3.31.843 2.37 2.37a1.724 1.724 0 0 0 1.065 2.592c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.591c.94 1.527-.843 3.31-2.37 2.37a1.724 1.724 0 0 0-2.592 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.591-1.066c-1.527.94-3.31-.843-2.37-2.37a1.724 1.724 0 0 0-1.065-2.592c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.591c-.94-1.527.843-3.31 2.37-2.37.996.612 2.296.07 2.592-1.066Z" />
              <path d="M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
            </svg>
          </Link>

          <button
            onClick={onSignOut}
            aria-label="Log out"
            title="Log out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
          >
            <span aria-hidden="true" className="text-lg leading-none">↪</span>
          </button>
        </div>
      </div>
    </div>
  );
}
