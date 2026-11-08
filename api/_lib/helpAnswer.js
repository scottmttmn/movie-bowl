import { askModels } from "./describedSearch.js";
import { HELP_TOPICS, getHelpTopic } from "../../src/utils/helpTopics.js";

// The help panel's question, read into one of the guide's topic ids. The
// model sees only the ids and what each answers -- never the answers or the
// links -- and anything but a listed id or null is treated as no answer, so
// it can choose a topic but cannot write one. See src/utils/helpTopics.js.
export const HELP_SYSTEM_PROMPT = `You match a question from someone using Movie Bowl -- an app where a group puts movies in a shared bowl and the app draws one to watch -- to the one help topic that answers it.
Reply with JSON only, shaped exactly like {"topic":"<id>"} or {"topic":null}.
- Choose a topic only if it really answers the question. If none does -- a bug report, an idea, a feature the app does not have, or anything not about using the app -- reply {"topic":null}.
- Never invent an id.
Topics (id: questions it answers):
${HELP_TOPICS.map((topic) => `${topic.id}: ${topic.ask}`).join("\n")}`;

// { topic } when a model answered, even with "none"; null when none did.
export function normalizeHelpReply(raw) {
  if (!raw || typeof raw !== "object" || !("topic" in raw)) return null;
  return { topic: getHelpTopic(raw.topic)?.id || null };
}

export async function pickHelpTopic(question, options = {}) {
  return askModels({ system: HELP_SYSTEM_PROMPT, user: question, accept: normalizeHelpReply, ...options });
}
