import { describe, expect, it, vi } from "vitest";
import { readAllRows } from "../readAllRows";

function pagedQuery(pages) {
  const ranges = [];
  const buildQuery = vi.fn(() => ({
    range: vi.fn(async (from, to) => {
      ranges.push([from, to]);
      return pages.shift();
    }),
  }));
  return { buildQuery, ranges };
}

const rows = (from, count) => Array.from({ length: count }, (_, index) => ({ id: from + index }));

describe("readAllRows", () => {
  it("keeps reading while pages come back full, and stops at the first short one", async () => {
    const { buildQuery, ranges } = pagedQuery([
      { data: rows(0, 2), error: null },
      { data: rows(2, 2), error: null },
      { data: rows(4, 1), error: null },
    ]);

    const result = await readAllRows(buildQuery, { pageSize: 2 });

    expect(result).toEqual({ data: rows(0, 5), error: null });
    expect(ranges).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(buildQuery).toHaveBeenCalledTimes(3);
  });

  it("asks once more after an exactly full last page, and gets an empty one", async () => {
    const { buildQuery } = pagedQuery([
      { data: rows(0, 2), error: null },
      { data: [], error: null },
    ]);

    await expect(readAllRows(buildQuery, { pageSize: 2 })).resolves.toEqual({ data: rows(0, 2), error: null });
  });

  it("fails the whole read when a later page fails, rather than returning part of it", async () => {
    const error = { message: "timeout" };
    const { buildQuery } = pagedQuery([
      { data: rows(0, 2), error: null },
      { data: null, error },
    ]);

    await expect(readAllRows(buildQuery, { pageSize: 2 })).resolves.toEqual({ data: null, error });
  });

  it("drops a row that moved into the next page while the pages were read", async () => {
    const { buildQuery } = pagedQuery([
      { data: rows(0, 2), error: null },
      { data: [{ id: 1 }, { id: 2 }], error: null },
      { data: [], error: null },
    ]);

    const { data } = await readAllRows(buildQuery, { pageSize: 2 });
    expect(data.map((row) => row.id)).toEqual([0, 1, 2]);
  });
});
