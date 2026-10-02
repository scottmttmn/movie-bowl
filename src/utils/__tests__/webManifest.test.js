import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Android reads these once, when Chrome installs or refreshes the app, so a
// broken entry fails silently on people's phones rather than anywhere visible.
const manifest = JSON.parse(readFileSync(path.resolve("public/manifest.webmanifest"), "utf8"));

describe("web app manifest", () => {
  it("offers Add a movie on a long-press of the icon", () => {
    expect(manifest.shortcuts).toEqual([expect.objectContaining({ name: "Add a movie", url: "/quick-add" })]);
    for (const icon of manifest.shortcuts[0].icons) {
      expect(() => readFileSync(path.resolve(`public${icon.src}`))).not.toThrow();
    }
  });

  it("takes shares as a plain link to /quick-add, which needs no service worker", () => {
    expect(manifest.share_target).toEqual({
      action: "/quick-add", method: "GET", params: { title: "title", text: "text", url: "url" },
    });
  });
});
