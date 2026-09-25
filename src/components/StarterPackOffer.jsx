import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchStarterPackPeople, installStarterPack, readBowlStarterPack } from "../lib/starterPacks";
import { describeStarterPack, getStarterPack } from "../utils/starterPacks";
import StarterPackSuggestions from "./StarterPackSuggestions";

// What an empty bowl shows its owner (output/designs/starter-packs.md,
// "Surfaces"): the one place a pack is offered rather than found. Three packs
// to start from, the full shelf a tap away, and the same say-it-before-you-pour
// step the shelf has. The dashboard decides when this appears; this decides
// what it can offer, which depends on whether the bowl already has a pack.

function OfferForBowl({ bowlId, onSeeAll, onInstalled }) {
  const [state, setState] = useState({ isLoading: true, slug: null, heldTmdbIds: [], loadError: null });
  const [people, setPeople] = useState({});
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState(null);

  // Whether this bowl's offer is still the one on screen. A layout effect, so
  // it turns false inside the same synchronous commit that swaps the bowl:
  // nothing that settles afterwards -- a read, a pour -- can pass for the bowl
  // now showing.
  const isOnScreen = useRef(false);
  useLayoutEffect(() => {
    isOnScreen.current = true;
    return () => {
      isOnScreen.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readBowlStarterPack(bowlId).then((next) => {
      if (!cancelled && isOnScreen.current) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bowlId]);

  const offersPacks = !state.isLoading && !state.loadError && !state.slug;

  useEffect(() => {
    if (!offersPacks) return undefined;
    let cancelled = false;
    fetchStarterPackPeople().then((next) => {
      if (!cancelled) setPeople(next || {});
    });
    return () => {
      cancelled = true;
    };
  }, [offersPacks]);

  // Nothing until the bowl's pack is known: which offer is right depends on
  // it, and the wrong one for a moment is worse than none.
  if (state.isLoading) return null;

  // A pack whose titles are all gone, or a read that failed: the shelf in
  // Bowl Settings can say more than this can, so point there.
  if (!offersPacks) {
    const installed = state.slug ? getStarterPack(state.slug) : null;
    return (
      <p className="mt-3 text-center text-sm text-slate-400">
        Nothing to draw yet.{" "}
        <button
          type="button"
          className="font-semibold text-rose-300 underline-offset-2 hover:underline"
          onClick={onSeeAll}
        >
          {installed ? `Pull more from the ${installed.name} pack` : "Start with a starter pack"}
        </button>
      </p>
    );
  }

  const selectedPack = selectedSlug ? getStarterPack(selectedSlug) : null;

  const pour = async () => {
    if (!selectedPack || isWorking) return;
    setIsWorking(true);
    setFailure(null);
    const result = await installStarterPack({
      bowlId,
      slug: selectedPack.slug,
      heldTmdbIds: state.heldTmdbIds,
      packSlipCount: 0,
    });
    // A pour that lands after the picker moved on belongs to a bowl no longer
    // on screen: reloading it, or showing its failure, would dress the new
    // bowl in the old one's result.
    if (!isOnScreen.current) return;
    // On success the bowl reloads with the pack in it and this offer goes
    // away with the empty bowl, so there is nothing to confirm here.
    if (result.ok) await onInstalled?.();
    else setFailure(result.message);
    setIsWorking(false);
  };

  return (
    <section aria-labelledby="starter-pack-offer-title" className="panel-muted mt-4 space-y-4 p-4 text-left sm:p-5">
      <div className="space-y-1">
        <h2 id="starter-pack-offer-title" className="text-lg font-extrabold tracking-tight text-slate-50">
          Nothing to draw yet
        </h2>
        <p className="text-sm text-slate-300">Start tonight with a starter pack. Everyone&apos;s own picks can join it later.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Starter packs</p>
          <button type="button" className="text-sm font-bold text-rose-300 underline-offset-2 hover:underline" onClick={onSeeAll}>
            See all
          </button>
        </div>
        <StarterPackSuggestions people={people} selectedSlug={selectedSlug} disabled={isWorking} onSelect={setSelectedSlug} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1" aria-live="polite">
          {selectedPack ? (
            <>
              <p className="text-sm font-bold text-slate-50">{selectedPack.name}</p>
              <p className="text-sm text-slate-400">{describeStarterPack(selectedPack)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Choose one to see what goes in. Only you, the owner, see this.</p>
          )}
        </div>
        <button type="button" className="btn btn-primary sm:w-auto" disabled={!selectedPack || isWorking} onClick={pour}>
          {isWorking ? "Pouring…" : "Pour into the bowl"}
        </button>
      </div>
      {failure && <p role="alert" className="status-error text-sm">{failure}</p>}
    </section>
  );
}

// One offer per bowl. The picker moves between bowls without remounting the
// dashboard, and nothing one bowl chose, read or poured may carry into the
// next, so a new bowl gets a new offer rather than a reset of the old one.
export default function StarterPackOffer(props) {
  return <OfferForBowl key={props.bowlId} {...props} />;
}
