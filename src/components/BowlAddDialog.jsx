import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import useBowlAdd from "../hooks/useBowlAdd";
import { isUnsettledAddCode } from "../lib/addBowlMovie";
import useUserBowls from "../hooks/useUserBowls";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useModalFocus from "../hooks/useModalFocus";
import MovieSearch from "./MovieSearch";
import AddedMoviesList from "./AddedMoviesList";

function choiceDescription(bowl, bowls) {
  const matches = bowls.filter((other) => other.name === bowl.name);
  if (matches.length < 2) return null;
  let length = 6;
  while (length < bowl.id.length && matches.some((other) => other.id !== bowl.id && other.id.slice(-length) === bowl.id.slice(-length))) length += 2;
  return `${bowl.role} · ${bowl.id.slice(-length)}`;
}

export default function BowlAddDialog() {
  const add = useBowlAdd();
  const location = useLocation();
  const { bowls, defaultBowlId } = useUserBowls();
  const { streamingServices } = useUserStreamingServices();
  const dialog = useRef(null);
  const search = useRef(null);
  const additions = useRef(null);
  const choices = useRef(null);
  const selectorButton = useRef(null);
  const openLocation = useRef(location.key);
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  const [sessionView, setSessionView] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0 }));
  const destination = add.destination;
  const closeAddDialog = add.close;
  const lost = destination && !bowls.some((bowl) => bowl.id === destination.id);
  // An unfinished add no longer blocks the dialog; it keeps its own notice and
  // only refuses a second attempt at the same title in the same bowl.
  const result = isUnsettledAddCode(add.result?.code) ? null : add.result;
  const disabled = add.pending || Boolean(lost) || add.initializing;
  useEffect(() => {
    if (!add.open) {
      openLocation.current = location.key;
      return;
    }
    if (location.key !== openLocation.current) closeAddDialog();
  }, [add.open, closeAddDialog, location.key]);
  useEffect(() => {
    const update = () => setViewport({ height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0 });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const list = choices.current;
    const selected = list?.querySelector('[aria-pressed="true"]');
    if (selected) list.scrollTop = Math.max(0, selected.offsetTop - Math.max(0, (list.clientHeight - selected.offsetHeight) / 2));
  }, [expanded, viewport.height]);
  useLayoutEffect(() => {
    const list = choices.current;
    const surface = dialog.current;
    if (!expanded || !list || !surface) return;
    // Measure the actual header/trigger/search height, including wrapped bowl
    // names, instead of assuming the controls fit in a fixed amount of space.
    const overlayStyle = getComputedStyle(surface.parentElement);
    const surfaceStyle = getComputedStyle(surface);
    const outside = parseFloat(overlayStyle.paddingTop) + parseFloat(overlayStyle.paddingBottom)
      + parseFloat(surfaceStyle.borderTopWidth) + parseFloat(surfaceStyle.borderBottomWidth);
    const occupied = surface.scrollHeight - list.clientHeight;
    list.style.maxHeight = `${Math.max(44, Math.min(224, viewport.height - outside - occupied))}px`;
  }, [expanded, viewport.height, destination?.name, bowls]);
  useModalFocus(dialog, { active: add.open, getInvoker: add.getInvoker, onEscape: () => {
    if (expanded) { setExpanded(false); selectorButton.current?.focus(); }
    else if (details) { search.current?.back(); setDetails(false); }
    else if (additions.current?.dismiss()) return;
    else if (sessionView) { setSessionView(false); search.current?.focusSearch(); }
    else add.close();
  } });

  const choose = (bowl) => {
    add.setDestination(bowl);
    setExpanded(false);
    setSessionView(false);
    setAnnouncement(`Adding to ${bowl.name}`);
    search.current?.focusSearch();
  };
  const selector = <div className="mb-3">
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        {destination ? <div className="flex min-w-0 items-start gap-2 text-sm">
          <span className="shrink-0 pt-3 text-slate-400">Add to</span>
          <div className="min-w-0 flex-1">
            {bowls.length > 1 && !details ? <button ref={selectorButton} type="button"
              className="btn btn-secondary min-h-11 max-w-full whitespace-normal break-words text-left"
              aria-label={`Choose bowl. Current bowl: ${destination.name}`}
              aria-expanded={expanded} aria-controls="add-bowl-choices" disabled={add.pending}
              onClick={() => {
                if (!expanded) search.current?.blurSearch();
                setExpanded(!expanded);
              }}>
              <span className="min-w-0">{destination.name}</span><span aria-hidden="true" className="ml-2 shrink-0">▾</span>
            </button> : <p className="break-words py-3 font-medium text-slate-100">{destination.name}</p>}
            {expanded && <div ref={choices} id="add-bowl-choices" className="relative mt-2 space-y-2 overflow-y-auto overscroll-contain pr-1"
              style={{ maxHeight: Math.max(48, Math.min(224, viewport.height - 260)) }} aria-label="Bowls">
              {bowls.map((bowl) => <button type="button" key={bowl.id}
                aria-pressed={bowl.id === destination?.id}
                onFocus={(event) => {
                  const list = choices.current;
                  const row = event.currentTarget;
                  if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
                  else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
                }}
                onClick={() => choose(bowl)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${bowl.id === destination?.id ? "border-rose-600" : "border-slate-700"}`}>
                <span className="min-w-0 break-words"><span className="block">{bowl.name}</span>
                  {choiceDescription(bowl, bowls) && <span className="block text-xs text-slate-400">{choiceDescription(bowl, bowls)}</span>}
                  {bowl.id === defaultBowlId && <span className="block text-xs text-slate-400">Home</span>}
                </span>{bowl.id === destination?.id && <span aria-hidden="true">✓</span>}
              </button>)}
            </div>}
          </div>
        </div> : <p className="py-3 text-sm font-medium text-slate-200">Add to a bowl</p>}
      </div>
      <button className="icon-btn h-11 w-11 shrink-0" aria-label="Close add movie" onClick={add.close}>✕</button>
    </div>
    {lost && <div className="status-error mt-2" role="alert">
      You no longer have access to this bowl. Choose another bowl.
      {bowls.length === 1 && <button className="btn btn-secondary mt-2" disabled={add.pending} onClick={() => choose(bowls[0])}>Use {bowls[0].name}</button>}
    </div>}
    {bowls.length === 0 && !add.initializing && !add.bowlsError && <div className="panel-muted">
      <p>Create or join a bowl to add movies.</p>
      <Link to="/bowls" className="btn btn-secondary mt-3" onClick={add.close}>Go to My Bowls</Link>
    </div>}
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
  const feedback = <>
    {result?.ok && <p className="mt-2 text-sm text-emerald-300" role="status">Added {add.operation.movie.title} to {add.operation.bowlName}</p>}
    {result?.ok === false && <div className="status-error mt-2" role="alert">{result.message}</div>}
    {add.unresolved.map((entry) => {
      const retryable = entry.result.code === "add_not_committed";
      return <div key={entry.operation.submissionId} className="status-warning mt-2" role="alert">
        {entry.result.message}
        <button className="btn btn-secondary mt-2" disabled={add.pending} onClick={async () => {
          const settled = await (retryable ? add.retryAdd : add.checkStatus)(entry.operation.submissionId);
          if (settled?.ok) search.current?.reset();
        }}>{retryable ? "Try again" : "Check add status"}</button>
      </div>;
    })}
    {!details && add.additions.length > 0 && <button type="button" className="btn btn-ghost mt-2 w-full justify-between text-sm"
      aria-pressed={sessionView} onClick={() => {
        if (sessionView) {
          setSessionView(false);
          search.current?.focusSearch();
        } else {
          search.current?.blurSearch();
          setSessionView(true);
        }
      }}>
      <span>{sessionView ? "Back to search" : "Added this session"}</span>
      {!sessionView && <span className="text-xs text-slate-400">{add.additions.length}</span>}
    </button>}
  </>;
  return createPortal(<div className="bowl-add-overlay" hidden={!add.open} style={{ height: viewport.height, top: viewport.top }}>
    <div ref={dialog} tabIndex={-1} role={add.open ? "dialog" : undefined} aria-modal={add.open ? "true" : undefined}
      aria-labelledby="bowl-add-title" className="modal-surface bowl-add-surface">
      <h2 id="bowl-add-title" className="sr-only">Add a movie</h2>
      {selector}
      {add.initializing ? <p role="status">Loading your bowls…</p> : !destination && add.bowlsError ? <div role="alert" className="status-error">
        {add.bowlsError}<button className="btn btn-secondary mt-3" onClick={() => add.openGlobalAdd()}>Retry</button>
      </div> : <>
        {destination ? <MovieSearch controllerRef={search} inlineDetails disabled={disabled} submissionPending={add.pending}
          includeComment={false} autoFocusSearch={false}
          alternateBody={sessionView ? <AddedMoviesList add={add} bowls={bowls} controllerRef={additions}
            onRemoved={() => { setSessionView(false); search.current?.focusSearch(); }} /> : null}
          hideResults={expanded || bowls.length === 0} feedback={feedback}
          userStreamingServices={streamingServices} onDetailChange={setDetails}
          onSearchFocus={() => setSessionView(false)}
          onDraftChange={() => { setSessionView(false); add.clearFeedback(); }}
          detailActionLabel={`Add to ${destination.name}`} onSubmitMovie={add.submit} /> : null}
        {details && feedback}
      </>}
    </div>
  </div>, document.body);
}
