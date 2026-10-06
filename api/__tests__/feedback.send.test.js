import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const recordEmailUsageMock = vi.fn();

vi.mock("../_lib/usageCounters.js", () => ({ recordEmailUsage: (...args) => recordEmailUsageMock(...args) }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}));

import handler, { buildFeedbackEmail } from "../_lib/sendFeedback.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest(body, token = "access-token") {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
}

const fetchMock = vi.fn();

describe("api/feedback", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    fetchMock.mockReset();
    recordEmailUsageMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("INVITE_EMAIL_FROM", "Movie Bowl <hello@moviebowl.app>");
    vi.stubEnv("FEEDBACK_EMAIL_TO", "owner@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "friend@example.com" } }, error: null });
    rpcMock.mockResolvedValue({ data: { ok: true, id: "report-1" }, error: null });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts only POST from a signed-in account", async () => {
    const getRes = createRes();
    await handler({ method: "GET", headers: {} }, getRes);
    expect(getRes.statusCode).toBe(405);

    const anonymous = createRes();
    await handler(createRequest({ message: "hi" }, null), anonymous);
    expect(anonymous.statusCode).toBe(401);

    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });
    const expired = createRes();
    await handler(createRequest({ message: "hi" }), expired);
    expect(expired.statusCode).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty or overlong message before touching the database", async () => {
    const empty = createRes();
    await handler(createRequest({ message: "   " }), empty);
    expect(empty.statusCode).toBe(400);

    const long = createRes();
    await handler(createRequest({ message: "x".repeat(4001) }), long);
    expect(long.statusCode).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("records the report for the token's account and mails it with a reply-to", async () => {
    const res = createRes();
    await handler(createRequest({
      message: "  The draw did nothing  ",
      page: "/bowl/abc",
      device: "Pixel · 412×915",
      build: "abc123",
      userId: "someone-else",
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("record_feedback_report", {
      p_user_id: "user-1",
      p_message: "The draw did nothing",
      p_error_text: null,
      p_page: "/bowl/abc",
      p_device: "Pixel · 412×915",
      p_build: "abc123",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const mail = JSON.parse(init.body);
    expect(mail).toMatchObject({
      to: ["owner@example.com"],
      reply_to: "friend@example.com",
      subject: "Movie Bowl feedback: The draw did nothing",
    });
    expect(mail.text).toContain("Page: /bowl/abc");
    expect(recordEmailUsageMock).toHaveBeenCalledWith(1, expect.objectContaining({ label: "feedback" }));
  });

  it("takes an error report with no message and clips oversized context", async () => {
    const res = createRes();
    await handler(createRequest({ errorText: "TypeError: boom", device: "d".repeat(900) }), res);

    expect(res.statusCode).toBe(200);
    const args = rpcMock.mock.calls[0][1];
    expect(args.p_message).toBe("");
    expect(args.p_error_text).toBe("TypeError: boom");
    expect(args.p_device).toHaveLength(400);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe("Movie Bowl error report: TypeError: boom");
  });

  it("never stores an invite or add-link token from the page", async () => {
    await handler(createRequest({ message: "hi", page: "/add-to-bowl/secret-token" }), createRes());
    expect(rpcMock.mock.calls[0][1].p_page).toBe("/add-to-bowl/:token");
  });

  it("passes the database's rate limit back without mailing", async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, code: "rate_limited" }, error: null });
    const res = createRes();
    await handler(createRequest({ message: "again" }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe("rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when the report cannot be saved", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "down" } });
    const res = createRes();
    await handler(createRequest({ message: "hi" }), res);
    expect(res.statusCode).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A saved report that failed to mail must not invite a retry, which would
  // only save a second copy.
  it("still succeeds when the mail does not go", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const refused = createRes();
    await handler(createRequest({ message: "hi" }), refused);
    expect(refused.statusCode).toBe(200);

    fetchMock.mockRejectedValue(new Error("network"));
    const thrown = createRes();
    await handler(createRequest({ message: "hi" }), thrown);
    expect(thrown.statusCode).toBe(200);

    vi.stubEnv("RESEND_API_KEY", "");
    fetchMock.mockClear();
    const unconfigured = createRes();
    await handler(createRequest({ message: "hi" }), unconfigured);
    expect(unconfigured.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    // Attempts count, refused or thrown; no attempt counts nothing.
    expect(recordEmailUsageMock).toHaveBeenCalledTimes(2);
  });

  it("escapes what the sender wrote in the mail's HTML", () => {
    const email = buildFeedbackEmail({ email: "a@b.c", message: "<script>x</script>", errorText: "", page: "/", device: "", build: "" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
