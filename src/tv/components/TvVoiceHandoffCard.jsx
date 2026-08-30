import { buildVoiceHandoffCommand } from "../../utils/webLaunch";

export default function TvVoiceHandoffCard({ title, launchTarget }) {
  const command = buildVoiceHandoffCommand(title, launchTarget);
  if (!command) return null;
  return (
    <div className="tv-voice-handoff">
      <p>Hold the mic button and say:</p>
      <strong>“{command}”</strong>
    </div>
  );
}
