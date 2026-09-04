import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ServiceLogo from "../ServiceLogo";

describe("ServiceLogo", () => {
  afterEach(() => {
    cleanup();
  });

  it("points at TMDB's CDN for a service the generated map covers", () => {
    const { container } = render(<ServiceLogo service="Netflix" />);
    const img = container.querySelector("img");

    expect(img).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
    );
  });

  // The name is always rendered beside it, so announcing it twice would be
  // worse than not announcing it at all.
  it("is decorative, because the caller shows the name too", () => {
    render(<ServiceLogo service="Netflix" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // Showtime folded into Paramount+ and has no TMDB entry in the US list, so it
  // is the live example of a service the map cannot cover.
  it("renders nothing for a service the map has no art for", () => {
    const { container } = render(<ServiceLogo service="Showtime" />);

    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing rather than a broken tile for an unknown name", () => {
    const { container } = render(<ServiceLogo service="Not A Service" />);

    expect(container.querySelector("img")).toBeNull();
  });
});
