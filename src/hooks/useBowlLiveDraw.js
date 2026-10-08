import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getBowlLiveTopic, parseLiveDraw } from "../utils/liveDraw";

/**
 * A bowl's live channel: a draw made on one screen plays on every other screen
 * open on the same bowl, and a television says it is listening so a phone can
 * show that its draw will play there.
 *
 * `surface` is "tv" or "web". Only a television announces itself, and only
 * while `available` -- sitting on the draw screen, not mid-preview or handed
 * off to a streaming app -- because that is the only time it would pick a
 * draw up. Every surface hears draws through `onDraw`, with the announcement
 * already checked by `parseLiveDraw`.
 *
 * Nothing here is required. A channel that cannot be joined (no Realtime, a
 * refused join, an old database without the policies) leaves no television
 * showing and draws work exactly as they did; it is logged, never shown.
 */
export default function useBowlLiveDraw({ bowlId, surface = "web", available = true, onDraw } = {}) {
  const [televisionPresent, setTelevisionPresent] = useState(false);
  const channelRef = useRef(null);
  const channelBowlRef = useRef(null);
  const joinedRef = useRef(false);
  const availableRef = useRef(available);
  const onDrawRef = useRef(onDraw);
  // The channel outlives renders, so it reads the latest handler and state
  // through refs rather than re-joining whenever they change.
  useLayoutEffect(() => {
    onDrawRef.current = onDraw;
    availableRef.current = available;
  });
  const isTelevision = surface === "tv";

  useEffect(() => {
    const topic = getBowlLiveTopic(bowlId);
    if (!topic || typeof supabase?.channel !== "function") return undefined;

    let channel;
    try {
      channel = supabase.channel(topic, {
        config: { private: true, broadcast: { self: false } },
      });
    } catch (error) {
      console.error("[useBowlLiveDraw] Could not open the live channel", error);
      return undefined;
    }
    channelRef.current = channel;
    channelBowlRef.current = bowlId;
    // A channel being left can still report in after its replacement joined;
    // only the current one may touch the shared state.
    let current = true;

    const readPresence = () => {
      if (!current) return;
      const state = channel.presenceState?.() || {};
      const present = Object.values(state).some((metas) =>
        (metas || []).some((meta) => meta?.surface === "tv")
      );
      // A television does not count itself.
      setTelevisionPresent(!isTelevision && present);
    };

    channel
      .on("presence", { event: "sync" }, readPresence)
      .on("broadcast", { event: "draw" }, ({ payload } = {}) => {
        if (!current) return;
        const draw = parseLiveDraw(payload);
        if (draw) onDrawRef.current?.(draw);
      })
      .subscribe((status, error) => {
        if (!current) return;
        if (status === "SUBSCRIBED") {
          joinedRef.current = true;
          if (isTelevision && availableRef.current) channel.track({ surface: "tv" });
          return;
        }
        // Off the channel, a draw cannot reach the television, so the phone
        // stops saying it will. A rejoin syncs presence again.
        joinedRef.current = false;
        setTelevisionPresent(false);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[useBowlLiveDraw] The live channel is unavailable", status, error);
        }
      });

    return () => {
      current = false;
      joinedRef.current = false;
      channelRef.current = null;
      channelBowlRef.current = null;
      setTelevisionPresent(false);
      supabase.removeChannel?.(channel);
    };
  }, [bowlId, isTelevision]);

  // A television comes and goes from the presence list as it becomes able, or
  // unable, to pick up a draw.
  useEffect(() => {
    const channel = channelRef.current;
    if (!isTelevision || !channel || !joinedRef.current) return;
    if (available) channel.track({ surface: "tv" });
    else channel.untrack();
  }, [available, isTelevision]);

  // A draw names the bowl it was made in. It can still be in flight when the
  // screen moves to another bowl, and by then the channel is that bowl's: an
  // announcement there would set every idle screen on it reloading for a
  // movie it does not have.
  const announceDraw = useCallback((draw, fromBowlId) => {
    const channel = channelRef.current;
    if (!draw || !channel || !joinedRef.current) return;
    if (!fromBowlId || fromBowlId !== channelBowlRef.current) return;
    Promise.resolve(channel.send({ type: "broadcast", event: "draw", payload: draw })).catch((error) => {
      console.error("[useBowlLiveDraw] Could not announce the draw", error);
    });
  }, []);

  return { televisionPresent, announceDraw };
}
