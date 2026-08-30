import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsSectionNav from "../SettingsSectionNav";

describe("SettingsSectionNav", () => {
  afterEach(cleanup);

  it("renders a labelled tile per section", () => {
    render(
      <SettingsSectionNav
        items={[
          { href: "#drawing", label: "Drawing", value: "Rotation • Everyone can draw" },
          { href: "#people", label: "People", value: "3 members" },
        ]}
      />
    );

    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#drawing", "#people"]);
    expect(links[0]).toHaveTextContent("Drawing");
    expect(links[0]).toHaveTextContent("Rotation • Everyone can draw");
    expect(links[1]).toHaveTextContent("3 members");
  });

  it("renders nothing without items", () => {
    const { container } = render(<SettingsSectionNav items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("focuses and scrolls to a section without navigating or adding history", () => {
    render(
      <>
        <SettingsSectionNav items={[{ href: "#drawing", label: "Drawing", value: "Rotation" }]} />
        <section id="drawing" tabIndex={-1} aria-label="Drawing settings" />
      </>
    );
    const section = screen.getByRole("region", { name: "Drawing settings" });
    section.scrollIntoView = vi.fn();
    const href = window.location.href;
    const historyLength = window.history.length;

    expect(fireEvent.click(screen.getByRole("link", { name: /drawing/i }))).toBe(false);

    expect(section).toHaveFocus();
    expect(section.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(window.location.href).toBe(href);
    expect(window.history.length).toBe(historyLength);
  });
});
