import { useEffect, useMemo, useState } from "react";
import {
  fetchStarterPackPeople,
  installStarterPack,
  readBowlStarterPack,
  removeStarterPack,
} from "../lib/starterPacks";
import {
  STARTER_PACKS,
  STARTER_PACK_MAX_SLIPS,
  bestPictureWinnersFor,
  describeStarterPack,
  getStarterPack,
  groupFilmographyPacks,
  starterPackDecade,
} from "../utils/starterPacks";
import LaurelWreath from "./LaurelWreath";
import StarterPackPhoto from "./StarterPackPhoto";

// Bowl Settings' starter pack section (output/designs/starter-packs.md,
// "Surfaces"). The owner picks a pack from a shelf -- one card per person,
// with a button per decade, and the Best Picture decades in a laurel -- then
// tops it up or removes it; members see which pack is in the bowl and
// nothing to press. The bowl never shows a pack's contents: the cards show
// the person, never their movies, which a poster would give away.

const PERSON_GROUPS = groupFilmographyPacks();
const DIRECTORS = PERSON_GROUPS.filter((group) => group.role === "directing");
const STARS = PERSON_GROUPS.filter((group) => group.role === "acting");
const BEST_PICTURE = STARTER_PACKS.filter((pack) => pack.kind === "best-picture");

function formatInstalledOn(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
}

function DecadeButton({ pack, selectedSlug, onSelect, disabled }) {
  const isSelected = pack.slug === selectedSlug;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={pack.name}
      disabled={disabled}
      onClick={() => onSelect(pack.slug)}
      className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition ${
        isSelected
          ? "border-rose-400 bg-rose-600 text-white"
          : "border-slate-600/70 bg-slate-900/60 text-slate-300 hover:border-slate-500 hover:text-white"
      }`}
    >
      {starterPackDecade(pack)}
    </button>
  );
}

function PersonCard({ group, profilePath, selectedSlug, onSelect, disabled, compact = false }) {
  const isSelected = group.packs.some((pack) => pack.slug === selectedSlug);
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border transition ${
        isSelected
          ? "border-rose-400 bg-rose-950/30 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]"
          : "border-slate-700/60 bg-slate-950/45"
      }`}
    >
      <div className="relative">
        <StarterPackPhoto profilePath={profilePath} className={compact ? "h-36" : "h-40"} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/95 to-transparent" />
        <h4 className="absolute inset-x-3 bottom-2 text-base font-extrabold leading-tight text-white">{group.person}</h4>
        {isSelected && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 shadow-lg" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
        )}
      </div>
      <div role="group" aria-label={`${group.person} decades`} className="flex flex-wrap gap-1.5 p-3">
        {group.packs.map((pack) => (
          <DecadeButton key={pack.slug} pack={pack} selectedSlug={selectedSlug} onSelect={onSelect} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}

function ShelfHeading({ title, detail }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      <span className="text-sm text-slate-400">{detail}</span>
    </div>
  );
}

// The installed pack, shown the way its cards are: a person's photo with the
// decade on a slip, or the decade in its laurel.
function InstalledArt({ pack, profilePath }) {
  if (pack?.kind === "best-picture") {
    return (
      <div className="flex h-44 w-36 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-950/60 to-slate-950">
        <span className="relative flex h-[84px] w-28 items-center justify-center">
          <LaurelWreath className="absolute inset-0 h-full w-full" />
          <span className="relative text-lg font-extrabold text-amber-200">{starterPackDecade(pack)}</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">Best Picture</span>
      </div>
    );
  }
  return (
    <div className="relative h-48 w-40 flex-shrink-0">
      <StarterPackPhoto profilePath={profilePath} className="h-44 w-36 rounded-2xl border border-slate-600/50" />
      {pack && (
        <span className="starter-pack-slip absolute bottom-0 right-0" aria-hidden="true">
          the {starterPackDecade(pack)}
        </span>
      )}
    </div>
  );
}

export default function StarterPackSection({ bowlId, isOwner, onSummaryChange }) {
  const [state, setState] = useState({
    isLoading: true, slug: null, installedAt: null, packSlipCount: 0, drawnCount: 0, heldTmdbIds: [], loadError: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [people, setPeople] = useState({});
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readBowlStarterPack(bowlId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bowlId, reloadKey]);

  const installedPack = state.slug ? getStarterPack(state.slug) : null;
  const packName = installedPack?.name || state.slug;
  // Only the owner's shelf and an installed filmography pack show a face. A
  // cold lookup is nine TMDB searches, so nobody else's view pays for one.
  const showsPhotos = !state.isLoading && !state.loadError
    && (installedPack ? installedPack.kind === "filmography" : isOwner && !state.slug);

  // Photos are dressing: the shelf renders at once with silhouettes and the
  // pictures arrive when they do.
  useEffect(() => {
    if (!showsPhotos) return undefined;
    let cancelled = false;
    fetchStarterPackPeople().then((next) => {
      if (!cancelled) setPeople(next || {});
    });
    return () => {
      cancelled = true;
    };
  }, [showsPhotos]);

  useEffect(() => {
    if (state.isLoading) return;
    onSummaryChange?.(packName || "None");
  }, [state.isLoading, packName, onSummaryChange]);

  // The empty bowl's offer links here. The section renders after the page's
  // own load, too late for the browser's jump to a hash, so it makes its own.
  const hasLoaded = !state.isLoading;
  useEffect(() => {
    if (!hasLoaded || window.location.hash !== "#starter-pack") return;
    const section = document.getElementById("starter-pack");
    section?.focus({ preventScroll: true });
    section?.scrollIntoView?.({ block: "start" });
  }, [hasLoaded]);

  const selectedPack = useMemo(() => (selectedSlug ? getStarterPack(selectedSlug) : null), [selectedSlug]);

  const install = async (slug) => {
    setIsWorking(true);
    setNotice(null);
    const result = await installStarterPack({
      bowlId,
      slug,
      heldTmdbIds: state.heldTmdbIds,
      packSlipCount: state.slug === slug ? state.packSlipCount : 0,
    });
    setNotice({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) setSelectedSlug(null);
    setReloadKey((key) => key + 1);
    setIsWorking(false);
  };

  const remove = async () => {
    setIsWorking(true);
    setNotice(null);
    const result = await removeStarterPack({ bowlId });
    setNotice({ tone: result.ok ? "success" : "error", message: result.message });
    setIsConfirmingRemove(false);
    setReloadKey((key) => key + 1);
    setIsWorking(false);
  };

  const isFull = state.packSlipCount >= STARTER_PACK_MAX_SLIPS;
  const installedPhoto = installedPack?.person ? people[installedPack.person] : null;
  const installedOn = formatInstalledOn(state.installedAt);
  const titles = (count) => `${count} ${count === 1 ? "title" : "titles"}`;

  return (
    <section id="starter-pack" tabIndex={-1} className="panel scroll-mt-24" aria-labelledby="starter-pack-heading">
      <h2 id="starter-pack-heading" className="section-title">Starter pack</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Up to {STARTER_PACK_MAX_SLIPS} titles from a list, to get the bowl to its first draw. They belong to no one:
        each waits in everybody&apos;s pile, and adding one yourself makes it yours.
      </p>

      {state.isLoading ? (
        <p className="mt-4 text-sm text-slate-400" role="status">Loading…</p>
      ) : state.loadError ? (
        <div className="status-error mt-4" role="alert">{state.loadError}</div>
      ) : packName ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <InstalledArt pack={installedPack} profilePath={installedPhoto} />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-50">{packName}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {installedOn ? `Poured in on ${installedOn} · ` : ""}in everybody&apos;s pile
                </p>
              </div>
              <div
                role="img"
                aria-label={`${titles(state.packSlipCount)} waiting, ${state.drawnCount} drawn`}
                className="flex flex-wrap gap-1.5"
              >
                {Array.from({ length: state.packSlipCount }, (_, index) => (
                  <span key={`w${index}`} className="h-[18px] w-[26px] rounded-[3px] bg-gradient-to-b from-[#fffef9] to-[#e9e3d6] shadow-[0_6px_10px_-6px_rgba(0,0,0,0.9)]" />
                ))}
                {Array.from({ length: Math.min(state.drawnCount, STARTER_PACK_MAX_SLIPS) }, (_, index) => (
                  <span key={`d${index}`} className="h-4 w-6 rounded-[3px] border border-dashed border-slate-500" />
                ))}
              </div>
              <p className="flex flex-wrap gap-x-4 text-sm">
                <span className="font-bold text-slate-100">
                  {state.packSlipCount === 0 ? "None waiting in the bowl" : `${state.packSlipCount} waiting in the bowl`}
                </span>
                <span className="text-slate-400">{state.drawnCount} drawn so far</span>
              </p>
            </div>
          </div>

          {isOwner ? (
            isConfirmingRemove ? (
              <div className="surface-card space-y-3 p-4">
                <p className="text-sm text-slate-200">
                  {state.packSlipCount > 0
                    ? `Remove the ${packName} pack and its ${titles(state.packSlipCount)} still waiting? Drawn and claimed ones stay.`
                    : `Remove the ${packName} pack?`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-danger" onClick={remove} disabled={isWorking}>Remove pack</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setIsConfirmingRemove(false)} disabled={isWorking}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="surface-card flex flex-col gap-2 p-4">
                  <h4 className="text-sm font-bold text-slate-100">Pull more</h4>
                  <p className="text-sm text-slate-400">
                    {isFull
                      ? `The bowl already holds ${STARTER_PACK_MAX_SLIPS} of its titles.`
                      : `Tops the pack back up to ${STARTER_PACK_MAX_SLIPS} with titles the bowl hasn't had.`}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary self-start"
                    onClick={() => install(state.slug)}
                    disabled={isWorking || isFull}
                  >
                    {isWorking ? "Working…" : "Pull more"}
                  </button>
                </div>
                <div className="surface-card flex flex-col gap-2 p-4">
                  <h4 className="text-sm font-bold text-slate-100">Swap for another pack</h4>
                  <p className="text-sm text-slate-400">
                    Takes the waiting titles back out. Drawn and claimed ones stay.
                  </p>
                  <button type="button" className="btn btn-danger self-start" onClick={() => setIsConfirmingRemove(true)} disabled={isWorking}>
                    Remove this pack…
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-xs text-slate-500">Only the bowl owner can change the pack.</p>
          )}
        </div>
      ) : isOwner ? (
        <div className="mt-5 space-y-6">
          <div className="space-y-3">
            <ShelfHeading title="Directors" detail="Movies they directed, by decade" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DIRECTORS.map((group) => (
                <PersonCard
                  key={group.person}
                  group={group}
                  profilePath={people[group.person]}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                  disabled={isWorking}
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <ShelfHeading title="Stars" detail="Movies they led, by decade" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STARS.map((group) => (
                <PersonCard
                  key={group.person}
                  group={group}
                  profilePath={people[group.person]}
                  selectedSlug={selectedSlug}
                  onSelect={setSelectedSlug}
                  disabled={isWorking}
                  compact
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <ShelfHeading title="Best Picture winners" detail="Every winner of a decade" />
            <div role="group" aria-label="Best Picture decades" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {BEST_PICTURE.map((pack) => {
                const isSelected = pack.slug === selectedSlug;
                return (
                  <button
                    key={pack.slug}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={pack.name}
                    disabled={isWorking}
                    onClick={() => setSelectedSlug(pack.slug)}
                    className={`flex min-h-24 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition ${
                      isSelected
                        ? "border-rose-400 bg-rose-950/40 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]"
                        : "border-yellow-400/30 bg-gradient-to-br from-yellow-950/50 to-slate-950 hover:border-yellow-300/50"
                    }`}
                  >
                    <span className="relative flex aspect-[76/58] w-full max-w-[76px] items-center justify-center">
                      <LaurelWreath className="absolute inset-0 h-full w-full" />
                      <span className="relative text-sm font-extrabold text-amber-200">{starterPackDecade(pack)}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-300">
                      {bestPictureWinnersFor(pack.decade).length} films
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="min-w-0 flex-1" aria-live="polite">
              {selectedPack ? (
                <>
                  <p className="text-sm font-bold text-slate-50">{selectedPack.name}</p>
                  <p className="text-sm text-slate-400">{describeStarterPack(selectedPack)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Choose a decade above to see what goes in.</p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => install(selectedSlug)}
              disabled={isWorking || !selectedPack}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 19h16" />
              </svg>
              {isWorking ? "Pouring…" : "Pour into the bowl"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">This bowl has no starter pack.</p>
      )}

      {notice && (
        <div
          className={`mt-4 ${notice.tone === "success" ? "status-success" : "status-error"}`}
          role={notice.tone === "success" ? "status" : "alert"}
        >
          {notice.message}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Photos and titles come from{" "}
        <a
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
        >
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </section>
  );
}
