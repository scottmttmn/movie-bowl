import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_TOPICS, getHelpTopic, helpTopicRoute, resolveHelpDestination } from "../helpTopics";

const read = (file) => readFileSync(path.resolve(file), "utf8");
const routes = new Set([...read("src/App.jsx").matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]));

// Where each route's targets are drawn. A topic whose route is not listed
// here cannot be checked, which is itself a failure: add the screen.
const SCREENS = {
  "/settings": ["src/screens/UserSettings.jsx"],
  "/bowl/:bowlId": ["src/screens/BowlDashboard.jsx"],
  "/bowl/:bowlId/settings": ["src/screens/BowlSettings.jsx", "src/components/StarterPackSection.jsx"],
  "/invites": ["src/screens/InvitesPage.jsx"],
  "/watch-list": ["src/screens/WatchListPage.jsx"],
};

describe("help guide", () => {
  it("has one entry per id, each with a short answer and a label", () => {
    expect(new Set(HELP_TOPICS.map((topic) => topic.id)).size).toBe(HELP_TOPICS.length);
    for (const topic of HELP_TOPICS) {
      expect(topic.id).toMatch(/^[a-z_]+$/);
      expect(topic.ask.length).toBeGreaterThan(10);
      // One line in the panel, not a paragraph.
      expect(topic.answer.length).toBeLessThanOrEqual(110);
      expect(topic.label.length).toBeGreaterThan(0);
    }
  });

  // The guard against drift: a setting that moves or is renamed fails here,
  // not in front of someone who asked where it went.
  it("sends every topic to a real route, and rings an element that page draws", () => {
    for (const topic of HELP_TOPICS) {
      const route = helpTopicRoute(topic);
      expect(routes, `${topic.id} goes to ${route}`).toContain(route);
      if (!topic.target) continue;
      const screens = SCREENS[route];
      expect(screens, `${topic.id}: no screen listed for ${topic.to}`).toBeDefined();
      const source = screens.map(read).join("\n");
      expect(source, `${topic.id}: #${topic.target} is not on ${route}`).toContain(`id="${topic.target}"`);
    }
  });

  it("keeps the eval set on topics that exist, with no-answer cases in it", () => {
    const cases = JSON.parse(read("scripts/help-eval/cases.json"));
    const ids = new Set(HELP_TOPICS.map((topic) => topic.id));
    for (const entry of cases) {
      if (entry.topic !== null) expect(ids, entry.q).toContain(entry.topic);
    }
    expect(cases.some((entry) => entry.topic === null)).toBe(true);
  });

  it("looks topics up by id only", () => {
    expect(getHelpTopic("favorite")?.label).toBe("My Movies");
    expect(getHelpTopic("nope")).toBeNull();
    expect(getHelpTopic(null)).toBeNull();
  });

  it("opens bowl topics on the given bowl, and My Bowls when there is none", () => {
    const filters = getHelpTopic("filters");
    expect(resolveHelpDestination(filters, "b 1")).toBe("/bowl/b%201");
    expect(resolveHelpDestination(filters, null)).toBe("/bowls");
    expect(resolveHelpDestination(getHelpTopic("solo_draw_removal"), null)).toBe("/settings");
    expect(resolveHelpDestination(null, "b1")).toBeNull();
    // Invitations is about the bowl asked from, or home when there is none.
    expect(resolveHelpDestination(getHelpTopic("invite_people"), "b1")).toBe("/invites?bowl=b1");
    expect(resolveHelpDestination(getHelpTopic("invite_people"), null)).toBe("/invites");
  });
});
