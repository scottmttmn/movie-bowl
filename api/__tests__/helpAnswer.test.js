import { describe, expect, it, vi } from "vitest";
import { HELP_SYSTEM_PROMPT, normalizeHelpReply, pickHelpTopic } from "../_lib/helpAnswer.js";
import { HELP_TOPICS } from "../../src/utils/helpTopics.js";

const provider = (name) => ({ name, url: `https://${name}.example/chat`, key: "k", model: "m", jsonMode: true, maxTokens: 100, extra: {} });
const reply = (content, ok = true) => ({ ok, status: ok ? 200 : 429, text: async () => "", json: async () => ({ choices: [{ message: { content } }] }) });

describe("help answer", () => {
  it("shows the model every topic and what it answers, but none of the answers or links", () => {
    for (const topic of HELP_TOPICS) {
      expect(HELP_SYSTEM_PROMPT).toContain(`${topic.id}: ${topic.ask}`);
      expect(HELP_SYSTEM_PROMPT).not.toContain(topic.answer);
    }
    expect(HELP_SYSTEM_PROMPT).not.toContain("/settings");
  });

  it("keeps only a listed id, and reads an explicit null as an answer of none", () => {
    expect(normalizeHelpReply({ topic: "favorite" })).toEqual({ topic: "favorite" });
    expect(normalizeHelpReply({ topic: "make_coffee" })).toEqual({ topic: null });
    expect(normalizeHelpReply({ topic: null })).toEqual({ topic: null });
    expect(normalizeHelpReply({ answer: "Go to Settings" })).toBeNull();
    expect(normalizeHelpReply(null)).toBeNull();
  });

  it("moves to the next provider when one is down or answers in the wrong shape", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply("", false))
      .mockResolvedValueOnce(reply("Sure! Go to settings."))
      .mockResolvedValueOnce(reply('Here you go: {"topic":"invite_people"}'));
    const result = await pickHelpTopic("add my partner", { providers: [provider("a"), provider("b"), provider("c")], fetchImpl });
    expect(result).toEqual({ topic: "invite_people" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetchImpl.mock.calls[2][1].body);
    expect(body.messages).toEqual([{ role: "system", content: HELP_SYSTEM_PROMPT }, { role: "user", content: "add my partner" }]);
  });

  it("returns null when no provider answered at all", async () => {
    expect(await pickHelpTopic("anything", { providers: [] })).toBeNull();
  });
});
