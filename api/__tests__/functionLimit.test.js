import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const API_DIRECTORY = resolve(process.cwd(), "api");
const FUNCTION_EXTENSION = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/;

function findFunctionFiles(directory = API_DIRECTORY) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_")) return [];

    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findFunctionFiles(path);
    return FUNCTION_EXTENSION.test(entry.name) ? [path] : [];
  });
}

describe("Vercel function inventory", () => {
  it("stays within the Hobby plan's 12-function deployment limit", () => {
    expect(findFunctionFiles()).toHaveLength(12);
  });
});
