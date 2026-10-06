import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));

import { describeFeedbackContext, sendFeedback } from "../feedback";

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.getSession.mockReset();
});

describe("describeFeedbackContext", () => {
  // Query strings carry invite tokens and search text; the sheet promises
  // only the page.
  it("sends the path without its query or hash, and the device", () => {
    const context = describeFeedbackContext({
      location: { pathname: "/accept-invite/abc", search: "?token=secret", hash: "#x" },
      navigator: { userAgent: "TestPhone/1.0" },
      innerWidth: 412,
      innerHeight: 915,
    });
    expect(context.page).toBe("/accept-invite/:token");
    expect(context.device).toBe("TestPhone/1.0 · 412×915");
    expect(typeof context.build).toBe("string");
  });

  // Invite and guest add-link tokens are credentials, even in the path.
  it("replaces the token in invite and add-link paths and leaves others alone", () => {
    const pageOf = (pathname) => describeFeedbackContext({ location: { pathname } }).page;
    expect(pageOf("/add-to-bowl/secret-token")).toBe("/add-to-bowl/:token");
    expect(pageOf("/accept-invite/secret-token")).toBe("/accept-invite/:token");
    expect(pageOf("/ADD-TO-BOWL/secret-token")).toBe("/add-to-bowl/:token");
    expect(pageOf("//Accept-Invite//secret-token")).toBe("/accept-invite/:token");
    expect(pageOf("/%61ccept-invite/secret-token")).toBe("/accept-invite/:token");
    expect(pageOf("/accept-invite%2Fsecret-token")).toBe("/accept-invite/:token");
    expect(pageOf("/%E0%A4%A/broken")).toBe("/%E0%A4%A/broken");
    expect(pageOf("/bowl/abc/settings")).toBe("/bowl/abc/settings");
  });
});

describe("sendFeedback", () => {
  it("asks a signed-out sender to sign in rather than posting", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendFeedback({ message: "hi" })).toEqual({ ok: false, message: "Sign in to send feedback." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts with the session token and lets a TV report name its page", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendFeedback({ message: "Remote skips", page: "/tv" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toMatchObject({ message: "Remote skips", page: "/tv" });
  });

  it("returns the server's message when it refuses", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "That's a lot at once. Try again in a while.", code: "rate_limited" }),
    }));
    expect(await sendFeedback({ message: "x" })).toEqual({
      ok: false,
      code: "rate_limited",
      message: "That's a lot at once. Try again in a while.",
    });
  });
});
