// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import setup, {
  fakeBackendModuleUrl,
  loadFakeBackendForCapture,
} from "./captureSetup.js";

const temporaryRoots = [];

async function historicalProject(fakeContents) {
  const root = await mkdtemp(path.join(process.cwd(), ".capture-setup-test-"));
  temporaryRoots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }), "utf8");
  if (fakeContents) {
    const support = path.join(root, "e2e/support");
    await mkdir(support, { recursive: true });
    await writeFile(path.join(support, "fakeBackend.js"), fakeContents, "utf8");
  }
  return root;
}

describe("visual-history capture setup", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("uses its own fake when no reproduced project root is supplied", async () => {
    const moduleUrl = await fakeBackendModuleUrl();
    expect(fileURLToPath(moduleUrl)).toBe(fileURLToPath(new URL("./fakeBackend.js", import.meta.url)));
  });

  it("loads the fake backend from the reproduced project", async () => {
    const root = await historicalProject(`
      import { expect, test as base } from "@playwright/test";
      export const DEFAULT_USER = { id: "historical-user" };
      class FakeBackend {}
      export const test = base.extend({});
      export { expect };
    `);
    const loaded = await loadFakeBackendForCapture(root);
    expect(loaded.DEFAULT_USER.id).toBe("historical-user");
  });

  it("leaves commits without a fake backend signed out", async () => {
    const root = await historicalProject();
    expect(await fakeBackendModuleUrl(root)).toBeUndefined();
    await expect(setup({ page: {}, projectRoot: root })).resolves.toBeUndefined();
  });

  describe("image fixtures", () => {
    async function routeImage(url) {
      const handlers = [];
      const page = {
        on() {},
        route: (pattern, handler) => {
          handlers.push({ pattern, handler });
        },
        addInitScript() {},
      };
      await setup({ page });
      const imageRoute = handlers.find((entry) => String(entry.pattern).includes("image.tmdb.org"));
      let fulfilled;
      await imageRoute.handler({
        request: () => ({ url: () => url }),
        fulfill: (response) => {
          fulfilled = response;
        },
      });
      return fulfilled;
    }

    it("serves a seeded poster from its fixture", async () => {
      const fulfilled = await routeImage("https://image.tmdb.org/t/p/w342/evolution-1.jpg");

      expect(fulfilled.status).toBe(200);
      expect(fulfilled.contentType).toBe("image/svg+xml");
      expect(fulfilled.body).toContain("The Long Goodbye");
    });

    // A 404 renders as a broken-image icon, and provider logos have been
    // requested on the settings screens since September 2026 -- so refusing
    // them would bake a fault the app never had into every later capture.
    it("serves a plain tile for art it has no fixture for", async () => {
      const fulfilled = await routeImage("https://image.tmdb.org/t/p/w92/netflix-logo.jpg");

      expect(fulfilled.status).toBe(200);
      expect(fulfilled.contentType).toBe("image/svg+xml");
      expect(fulfilled.body).toContain("<svg");
      expect(fulfilled.body).not.toContain("The Long Goodbye");
    });
  });
});
