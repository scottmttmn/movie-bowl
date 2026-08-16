import { STREAMING_MATCH_STATUS } from "../hooks/useBowlStreamingMatches";
import { describeStreamingMatch } from "../utils/streamingMatchSummary";
import StatePill, { PillCount } from "./StatePill";

export default function StreamingMatchCount({
  status,
  count,
  topService,
  topServiceCount,
  isPrioritized = false,
  useServiceRank = true,
  onScan,
  onOpenPreferences,
}) {
  if (status === STREAMING_MATCH_STATUS.unavailable) return null;

  // "warning" is its own tone on purpose: streaming priority is engaged but
  // changing nothing, which should not look like a filter that is working.
  const pendingTone = isPrioritized ? "active" : "idle";

  if (status === STREAMING_MATCH_STATUS.manual) {
    return (
      <StatePill as="button" tone={pendingTone} onClick={onScan}>
        Count titles on my services
      </StatePill>
    );
  }

  if (status === STREAMING_MATCH_STATUS.scanning) {
    return <StatePill tone={pendingTone}>Checking your services…</StatePill>;
  }

  const { tone, lead, count: emphasizedCount, trail, label } = describeStreamingMatch({
    matchCount: count,
    topService,
    topServiceCount,
    isPrioritized,
    useServiceRank,
  });

  return (
    <StatePill
      as="button"
      tone={tone}
      onClick={onOpenPreferences}
      ariaLabel={`${label} Open streaming match preferences.`}
    >
      <span>
        {lead ? `${lead} ` : null}
        {emphasizedCount === null ? null : <PillCount tone={tone}>{emphasizedCount}</PillCount>}
        {trail ? ` ${trail}` : null}
      </span>
    </StatePill>
  );
}
