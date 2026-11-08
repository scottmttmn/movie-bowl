import { requestSearchAction } from "./describedSearch";
import { getHelpTopic } from "../utils/helpTopics";

// The ? panel's one request. It resolves to the guide's topic, or null for
// anything else -- no topic, no model, no session, no network -- because the
// panel answers all of those the same way: by offering to send it as
// feedback. A failed request is not an error a person can do anything with.
export async function askHelp(question, options) {
  try {
    const body = await requestSearchAction({ type: "help", query: question }, options);
    return body?.status === "ok" ? getHelpTopic(body.topic) : null;
  } catch (error) {
    console.warn("[help] Failed to ask", error);
    return null;
  }
}
