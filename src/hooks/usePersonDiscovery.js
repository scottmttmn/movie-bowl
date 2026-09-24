import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTmdbPersonMovies, searchTmdbPeople } from "../lib/tmdbApi";

// A person's movies are revealed in batches of this size; the credits arrive
// whole, so "Show more" is local and never another request.
export const PERSON_MOVIES_BATCH = 20;

const EMPTY_PEOPLE = { query: "", people: [] };
const IDLE_CREDITS = { status: "idle", acting: [], directing: [] };

function openingRole(person, credits) {
  const preferred = person?.knownForDepartment === "Directing" ? "directing" : "acting";
  const other = preferred === "acting" ? "directing" : "acting";
  if (credits[preferred].length > 0) return preferred;
  return credits[other].length > 0 ? other : preferred;
}

/**
 * People search beside title search (output/designs/search-revamp.md). It owns
 * the people lookup for a query and, once someone picks a person, that
 * person's movies by role. Title search stays in MovieSearch; `searchPeople`
 * resolves once the lookup has settled, so a caller can give it a moment
 * before showing movies, but it never throws and never has to be waited for.
 */
export default function usePersonDiscovery() {
  const [peopleResult, setPeopleResult] = useState(EMPTY_PEOPLE);
  const [person, setPerson] = useState(null);
  const [role, setRole] = useState("acting");
  const [credits, setCredits] = useState(IDLE_CREDITS);
  const [visibleCount, setVisibleCount] = useState(PERSON_MOVIES_BATCH);
  const peopleRequestRef = useRef(0);
  const peopleAbortRef = useRef(null);
  const creditsRequestRef = useRef(0);

  const cancelPeople = useCallback(() => {
    peopleRequestRef.current += 1;
    peopleAbortRef.current?.abort();
    peopleAbortRef.current = null;
  }, []);

  const clearPeople = useCallback(() => {
    cancelPeople();
    setPeopleResult(EMPTY_PEOPLE);
  }, [cancelPeople]);

  const searchPeople = useCallback(async (query) => {
    const trimmed = String(query || "").trim();
    cancelPeople();
    setPeopleResult(EMPTY_PEOPLE);
    if (!trimmed) return;
    const requestId = peopleRequestRef.current;
    const controller = new AbortController();
    peopleAbortRef.current = controller;
    try {
      const { people } = await searchTmdbPeople(trimmed, { signal: controller.signal });
      if (requestId !== peopleRequestRef.current) return;
      setPeopleResult({ query: trimmed, people });
    } catch (error) {
      // No People row is the whole failure mode: title search already
      // answered, or will, on its own.
      if (requestId !== peopleRequestRef.current || error?.name === "AbortError") return;
      console.warn("[usePersonDiscovery] People search failed", error);
    }
  }, [cancelPeople]);

  const loadCredits = useCallback(async (chosen) => {
    creditsRequestRef.current += 1;
    const requestId = creditsRequestRef.current;
    setCredits({ ...IDLE_CREDITS, status: "loading" });
    try {
      const result = await getTmdbPersonMovies(chosen.id);
      if (requestId !== creditsRequestRef.current) return;
      setRole(openingRole(chosen, result));
      setCredits({ status: "ready", acting: result.acting, directing: result.directing });
    } catch (error) {
      if (requestId !== creditsRequestRef.current) return;
      console.error("[usePersonDiscovery] Failed to load a person's movies", error);
      setCredits({ ...IDLE_CREDITS, status: "failed" });
    }
  }, []);

  const openPerson = useCallback((chosen) => {
    if (!chosen) return;
    setPerson(chosen);
    setRole(chosen.knownForDepartment === "Directing" ? "directing" : "acting");
    setVisibleCount(PERSON_MOVIES_BATCH);
    loadCredits(chosen);
  }, [loadCredits]);

  const closePerson = useCallback(() => {
    creditsRequestRef.current += 1;
    setPerson(null);
    setCredits(IDLE_CREDITS);
    setVisibleCount(PERSON_MOVIES_BATCH);
  }, []);

  const retryCredits = useCallback(() => {
    if (person) loadCredits(person);
  }, [loadCredits, person]);

  const chooseRole = useCallback((nextRole) => {
    setRole(nextRole);
    setVisibleCount(PERSON_MOVIES_BATCH);
  }, []);

  const showMore = useCallback(() => {
    setVisibleCount((count) => count + PERSON_MOVIES_BATCH);
  }, []);

  const reset = useCallback(() => {
    clearPeople();
    closePerson();
  }, [clearPeople, closePerson]);

  useEffect(() => () => {
    peopleAbortRef.current?.abort();
  }, []);

  const roleMovies = credits[role];
  const visibleMovies = useMemo(() => roleMovies.slice(0, visibleCount), [roleMovies, visibleCount]);
  const roles = useMemo(
    () => ["acting", "directing"].filter((name) => credits[name].length > 0),
    [credits]
  );
  return {
    peopleResult,
    searchPeople,
    clearPeople,
    person,
    role,
    credits,
    // Tabs only when the person has feature credits in both roles.
    roles,
    visibleMovies,
    totalMovies: roleMovies.length,
    openPerson,
    closePerson,
    retryCredits,
    chooseRole,
    showMore,
    reset,
  };
}
