import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HelpLanding from "../HelpLanding";

describe("HelpLanding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  const land = (target) => render(
    <MemoryRouter initialEntries={[{ pathname: "/settings", state: { helpTarget: target } }]}><HelpLanding /></MemoryRouter>
  );

  it("waits for the section to be drawn, then rings it once", () => {
    land("solo-draw");
    const section = document.createElement("section");
    section.id = "solo-draw";
    act(() => { vi.advanceTimersByTime(300); });
    document.body.append(section);
    act(() => { vi.advanceTimersByTime(100); });
    expect(section).toHaveClass("help-target");
    expect(section.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(section).not.toHaveClass("help-target");
  });

  it("rings the row around a control rather than the control", () => {
    document.body.innerHTML = '<div data-help-row id="row"><label><input id="remove-from-bowls-on-solo-draw" type="checkbox" /></label></div>';
    land("remove-from-bowls-on-solo-draw");
    act(() => { vi.advanceTimersByTime(100); });
    expect(document.getElementById("row")).toHaveClass("help-target");
  });

  it("gives up quietly on a section this person cannot see", () => {
    land("add-links");
    act(() => { vi.advanceTimersByTime(6000); });
    const late = document.createElement("section");
    late.id = "add-links";
    document.body.append(late);
    act(() => { vi.advanceTimersByTime(500); });
    expect(late).not.toHaveClass("help-target");
  });
});
