import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: fetchMock }));
import useDrawProviderLinks from "../useDrawProviderLinks";

beforeEach(() => fetchMock.mockReset().mockResolvedValue({ links: [] }));
describe("draw provider lookup lifecycle", () => {
  it("starts during the animation, ignores older responses and scopes results to the drawn title", async () => {
    let finishFirst;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
    const link = { service: "Netflix", webUrl: "https://www.netflix.com/title/2" };
    const { result, rerender } = renderHook(({ bowlId, movie }) => useDrawProviderLinks(bowlId, movie), { initialProps: { bowlId: "b1", movie: null } });
    act(() => result.current.startLookup({ tmdb_id: 1 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(1, "b1"));
    expect(result.current.providerLinks).toEqual([]);
    fetchMock.mockResolvedValue({ links: [link] });
    act(() => result.current.startLookup({ tmdb_id: 2 }));
    rerender({ bowlId: "b1", movie: { tmdb_id: 2 } });
    await waitFor(() => expect(result.current.providerLinks).toEqual([link]));
    await act(async () => { finishFirst({ links: [{ service: "wrong" }] }); });
    expect(result.current.providerLinks).toEqual([link]);
    rerender({ bowlId: "b2", movie: null });
    expect(result.current.providerLinks).toEqual([]);
  });

  it("looks up restored TV draws and retries a re-draw of the same title", async () => {
    const { result, rerender } = renderHook(({ movie }) => useDrawProviderLinks("b1", movie), { initialProps: { movie: { tmdb_id: 1 } } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ movie: null });
    act(() => result.current.startLookup({ tmdb_id: 1 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
