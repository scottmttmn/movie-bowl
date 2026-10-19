import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { clearTitleDeparturesCache, fetchTitleDepartures } from "../titleDepartures";
let fetcher;
const departures = [{ service: "Netflix", expiresOn: null }];
beforeEach(() => {
  clearTitleDeparturesCache();
  mocks.session
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "token", user: { id: "one" } } } });
  fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ departures, validUntil: new Date(Date.now() + 86400000).toISOString() }),
    });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it("deduplicates concurrent title lookups and reuses the result for details", async () => {
  const values = await Promise.all([
    fetchTitleDepartures(77, "Netflix"),
    fetchTitleDepartures(77, "Netflix"),
  ]);
  expect(values[0].departures).toEqual(departures);
  await fetchTitleDepartures(77, "Netflix");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/title-departures/lookup",
    expect.objectContaining({
      body: '{"id":77}',
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});
it("does not reuse a personalized response across accounts or changed preferences", async () => {
  await fetchTitleDepartures(77, "Netflix");
  await fetchTitleDepartures(77, "Hulu");
  mocks.session.mockResolvedValue({
    data: { session: { access_token: "other-token", user: { id: "two" } } },
  });
  await fetchTitleDepartures(77, "Netflix");
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("does not make anonymous, custom-title or empty-service requests", async () => {
  await fetchTitleDepartures(null, "Netflix");
  await fetchTitleDepartures(77, "");
  mocks.session.mockResolvedValue({ data: { session: null } });
  expect(await fetchTitleDepartures(77, "Netflix")).toEqual({ departures: [] });
  expect(fetcher).not.toHaveBeenCalled();
});
it("discards expired results and hides network failures", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ departures, validUntil: "2000-01-01" }),
  });
  expect((await fetchTitleDepartures(77, "Netflix")).departures).toEqual([]);
  fetcher.mockRejectedValue(new Error("offline"));
  expect(await fetchTitleDepartures(78, "Netflix")).toEqual({ departures: [] });
});
it("clearing the cache prevents a late answer from restoring old data", async () => {
  let resolve;
  fetcher.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = fetchTitleDepartures(77, "Netflix");
  await Promise.resolve();
  clearTitleDeparturesCache();
  resolve({
    ok: true,
    json: async () => ({ departures, validUntil: new Date(Date.now() + 86400000).toISOString() }),
  });
  await pending;
  await fetchTitleDepartures(77, "Netflix");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("a read-only miss cannot suppress a later saved-title lookup", async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ departures: [] }) });
  await fetchTitleDepartures(77, "Netflix");
  const value = await fetchTitleDepartures(77, "Netflix", { bowlId: "saved-bowl" });
  expect(value.departures).toEqual(departures);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ id: 77, bowlId: "saved-bowl" });
  await fetchTitleDepartures(77, "Netflix");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
