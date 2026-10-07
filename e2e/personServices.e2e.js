import { expect, test } from "./support/fakeBackend";

// A person's movies narrowed to the viewer's services, through the add sheet.
test("a person's movies narrow to the viewer's services", async ({ page, backend }) => {
  backend.state.bowls.push({ id: "b1", name: "Friday Night", owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "person_first" });
  backend.state.defaults = { "user-smoke": "b1" };
  backend.state.profiles[0].streaming_services = ["Netflix", "Max", "Prime Video"];
  backend.state.tmdbSearchResults = [{ id: 900, title: "Clint", release_date: "2001-01-01" }];
  backend.state.tmdbPeople = [{ id: 190, name: "Clint Eastwood", profilePath: null, knownForDepartment: "Directing", knownFor: ["Gran Torino"] }];
  backend.state.tmdbPersonMovies = {
    190: {
      acting: [{ id: 4, title: "Dirty Harry", release_date: "1971-12-23", characters: ["Harry"] }],
      directing: [
        { id: 1, title: "Gran Torino", release_date: "2008-12-12" },
        { id: 2, title: "Letters from Iwo Jima", release_date: "2006-12-20" },
      ],
    },
  };
  backend.state.tmdbPersonOnServices = { 190: [1] };
  await backend.authenticate(page);
  await page.goto("/bowl/b1");
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("clint eastwood");
  await page.getByRole("button", { name: "Show Clint Eastwood’s movies" }).click();
  await expect(page.getByRole("button", { name: "Details for Letters from Iwo Jima" })).toBeVisible();

  // The whole name stays readable on a phone; the controls take their own line.
  const heading = page.getByText("Clint Eastwood’s movies", { exact: true });
  expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const filter = page.getByRole("button", { name: "Only movies on Netflix, Max, Prime Video" });
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Details for Letters from Iwo Jima" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Details for Gran Torino" })).toBeVisible();

  await page.getByRole("button", { name: "Add Gran Torino" }).click();
  await expect.poll(() => backend.state.bowl_movies.map((movie) => movie.title)).toEqual(["Gran Torino"]);
  // Still on the person, still filtered, ready for the next one.
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
