import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { installStarterPack, removeStarterPack } from "../lib/starterPacks";
import { STARTER_PACKS, STARTER_PACK_MAX_SLIPS, getStarterPack } from "../utils/starterPacks";

// Bowl Settings' starter pack section (output/designs/starter-packs.md,
// "Surfaces"). The owner installs one pack, tops it up, or removes it; members
// see which pack is in the bowl and nothing to press. The bowl never shows the
// pack's contents -- only how many of its titles are still waiting.

const PACK_GROUPS = [
  { label: "Directors and stars", packs: STARTER_PACKS.filter((pack) => pack.kind === "filmography") },
  { label: "Best Picture winners", packs: STARTER_PACKS.filter((pack) => pack.kind === "best-picture") },
];

function getStarterPackName(slug) {
  return getStarterPack(slug)?.name || slug;
}

// Which pack the bowl has, how many of its titles are still waiting, and every
// title the bowl holds or has drawn -- the last only steers what "pull more"
// offers, so a topped-up pack never brings back a title already watched.
const LOAD_FAILED = { isLoading: false, slug: null, packSlipCount: 0, heldTmdbIds: [], loadError: "Could not load this bowl's starter pack." };

async function readStarterPackState(bowlId) {
  let reads;
  try {
    reads = await Promise.all([
      supabase.from("bowls").select("starter_pack").eq("id", bowlId).maybeSingle(),
      supabase.from("bowl_movies").select("tmdb_id, starter_pack").eq("bowl_id", bowlId).is("drawn_at", null),
      supabase.from("bowl_draw_events").select("tmdb_id").eq("bowl_id", bowlId).is("returned_at", null),
    ]);
  } catch (error) {
    console.error("[StarterPackSection] Failed to load the starter pack", error);
    return LOAD_FAILED;
  }
  const [bowlRead, movieRead, drawRead] = reads;
  const error = bowlRead.error || movieRead.error || drawRead.error;
  if (error) {
    console.error("[StarterPackSection] Failed to load the starter pack", error);
    return LOAD_FAILED;
  }
  const movies = movieRead.data || [];
  return {
    isLoading: false,
    loadError: null,
    slug: bowlRead.data?.starter_pack || null,
    packSlipCount: movies.filter((movie) => movie.starter_pack).length,
    heldTmdbIds: [...movies, ...(drawRead.data || [])].map((row) => Number(row.tmdb_id)).filter((id) => id > 0),
  };
}

export default function StarterPackSection({ bowlId, isOwner, onSummaryChange }) {
  const [state, setState] = useState({ isLoading: true, slug: null, packSlipCount: 0, heldTmdbIds: [], loadError: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedSlug, setSelectedSlug] = useState(STARTER_PACKS[0].slug);
  const [isWorking, setIsWorking] = useState(false);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    readStarterPackState(bowlId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bowlId, reloadKey]);

  useEffect(() => {
    if (state.isLoading) return;
    onSummaryChange?.(state.slug ? getStarterPackName(state.slug) : "None");
  }, [state.isLoading, state.slug, onSummaryChange]);

  // The empty bowl's offer links here. The section renders after the page's
  // own load, too late for the browser's jump to a hash, so it makes its own.
  const hasLoaded = !state.isLoading;
  useEffect(() => {
    if (!hasLoaded || window.location.hash !== "#starter-pack") return;
    const section = document.getElementById("starter-pack");
    section?.focus({ preventScroll: true });
    section?.scrollIntoView?.({ block: "start" });
  }, [hasLoaded]);

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

  const packName = state.slug ? getStarterPackName(state.slug) : null;
  const isFull = state.packSlipCount >= STARTER_PACK_MAX_SLIPS;

  return (
    <section id="starter-pack" tabIndex={-1} className="panel scroll-mt-24" aria-labelledby="starter-pack-heading">
      <h2 id="starter-pack-heading" className="section-title">Starter pack</h2>
      <p className="mt-1 text-sm text-slate-400">
        Up to {STARTER_PACK_MAX_SLIPS} titles from a list, to get a new bowl to its first draw. They belong to nobody:
        each one is in everybody&apos;s pile, and adding one yourself makes it yours.
      </p>

      {state.isLoading ? (
        <p className="mt-4 text-sm text-slate-400" role="status">Loading…</p>
      ) : state.loadError ? (
        <div className="status-error mt-4" role="alert">{state.loadError}</div>
      ) : packName ? (
        <div className="mt-4">
          <div className="surface-card p-3">
            <p className="text-sm font-semibold text-slate-100">{packName}</p>
            <p className="mt-1 text-sm text-slate-400">
              {state.packSlipCount === 0
                ? "None of its titles are left in the bowl."
                : `${state.packSlipCount} of its titles ${state.packSlipCount === 1 ? "is" : "are"} still in the bowl.`}
            </p>
            {!isOwner && <p className="mt-2 text-xs text-slate-500">Only the bowl owner can change this.</p>}
          </div>
          {isOwner && (
            isConfirmingRemove ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="w-full text-sm text-slate-300">
                  {state.packSlipCount > 0
                    ? `Remove the ${packName} pack and its ${state.packSlipCount} ${state.packSlipCount === 1 ? "title" : "titles"} still in the bowl? Titles already drawn or claimed stay.`
                    : `Remove the ${packName} pack?`}
                </p>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={isWorking}>Remove pack</button>
                <button type="button" className="btn btn-ghost" onClick={() => setIsConfirmingRemove(false)} disabled={isWorking}>Cancel</button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => install(state.slug)}
                  disabled={isWorking || isFull}
                  title={isFull ? `The bowl already holds ${STARTER_PACK_MAX_SLIPS} of its titles.` : undefined}
                >
                  {isWorking ? "Working…" : "Pull more"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setIsConfirmingRemove(true)} disabled={isWorking}>
                  Remove pack…
                </button>
              </div>
            )
          )}
        </div>
      ) : isOwner ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm text-slate-300" htmlFor="starter-pack-choice">
            <span className="eyebrow block">Pack</span>
            <select
              id="starter-pack-choice"
              className="input-field mt-1 w-full"
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              disabled={isWorking}
            >
              {PACK_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.packs.map((pack) => (
                    <option key={pack.slug} value={pack.slug}>{pack.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => install(selectedSlug)} disabled={isWorking}>
            {isWorking ? "Adding…" : "Add pack"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">This bowl has no starter pack.</p>
      )}

      {notice && (
        <div className={`mt-3 ${notice.tone === "success" ? "status-success" : "status-error"}`} role={notice.tone === "success" ? "status" : "alert"}>
          {notice.message}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Pack titles are looked up on{" "}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="underline decoration-slate-700 underline-offset-2 hover:text-slate-300">
          TMDB
        </a>{" "}
        when they&apos;re added. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </section>
  );
}
