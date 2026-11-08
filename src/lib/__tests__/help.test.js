import { describe, expect, it, vi } from "vitest";
import { askHelp } from "../help";

const client = (token = "t") => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } });
const answering = (body, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 502, json: async () => body }));

describe("askHelp", () => {
  it("asks the search route's help action as the signed-in person and returns the guide's topic", async () => {
    const fetchImpl = answering({ status: "ok", topic: "invite_people" });
    const topic = await askHelp("add my partner", { client: client("abc"), fetchImpl });
    expect(topic.label).toBe("Invitations");
    expect(fetchImpl).toHaveBeenCalledWith("/api/tmdb/search?type=help&query=add+my+partner", { headers: { Authorization: "Bearer abc" } });
  });

  it("answers null for no topic, no model, no session and a failed request alike", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await askHelp("q", { client: client(), fetchImpl: answering({ status: "ok", topic: null }) })).toBeNull();
    expect(await askHelp("q", { client: client(), fetchImpl: answering({ status: "ok", topic: "made_up" }) })).toBeNull();
    expect(await askHelp("q", { client: client(), fetchImpl: answering({ status: "unavailable" }) })).toBeNull();
    expect(await askHelp("q", { client: client(null), fetchImpl: answering({}) })).toBeNull();
    expect(await askHelp("q", { client: client(), fetchImpl: answering({ error: "x" }, false) })).toBeNull();
  });
});
