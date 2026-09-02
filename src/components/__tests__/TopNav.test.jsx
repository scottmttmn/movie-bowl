import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TopNav from "../TopNav";

describe("TopNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers one accessible Add control and closes the navigation menu before opening it", () => {
    const onAddMovie = vi.fn();
    render(<MemoryRouter><TopNav onAddMovie={onAddMovie} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Navigation menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a movie" }));
    expect(onAddMovie).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your home bowl" })).toHaveAttribute("href", "/");
  });

  it("disables global Add while a modal or draw animation owns the screen", async () => {
    const { rerender } = render(<MemoryRouter><TopNav onAddMovie={vi.fn()} /></MemoryRouter>);
    rerender(<MemoryRouter><TopNav onAddMovie={vi.fn()} /><div aria-modal="true" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a movie" })).toBeDisabled());
    rerender(<MemoryRouter><TopNav onAddMovie={vi.fn()} /><div data-blocks-global-add /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a movie" })).toBeDisabled());
    rerender(<MemoryRouter><TopNav onAddMovie={vi.fn()} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a movie" })).toBeEnabled());
  });

  it("does not show global Add to signed-out visitors", () => {
    render(<MemoryRouter><TopNav isAuthenticated={false} onAddMovie={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Add a movie" })).not.toBeInTheDocument();
  });

  it("opens and closes the navigation menu", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByLabelText(/signed in as user@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /my bowls/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /watch history/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /tv mode/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls sign out from the menu", () => {
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={onSignOut} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on outside click", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps Invitations in the menu with no pending invitations and no badge", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" pendingInviteCount={0} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    const item = screen.getByRole("menuitem", { name: /invitations/i });
    expect(item).toHaveAttribute("href", "/invites");
    expect(item).not.toHaveTextContent(/\d/);
  });

  it("shows an invite badge and menu entry when invites are pending", () => {
    render(
      <MemoryRouter>
        <TopNav
          isSettingsRoute={false}
          onSignOut={vi.fn()}
          userEmail="user@example.com"
          pendingInviteCount={2}
        />
      </MemoryRouter>
    );

    const menuButton = screen.getByRole("button", { name: /navigation menu \(2 pending invites\)/i });
    expect(menuButton).toHaveTextContent("2");

    fireEvent.click(menuButton);
    const inviteItem = screen.getByRole("menuitem", { name: /invitations/i });
    expect(inviteItem).toHaveAttribute("href", "/invites");
    expect(inviteItem).toHaveTextContent("2");
  });

  it("caps the invite badge at 9+", () => {
    render(
      <MemoryRouter>
        <TopNav
          isSettingsRoute={false}
          onSignOut={vi.fn()}
          userEmail="user@example.com"
          pendingInviteCount={12}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("button", { name: /navigation menu \(12 pending invites\)/i })
    ).toHaveTextContent("9+");
  });

  it("hides the invite badge and menu entry when nothing is pending", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /^navigation menu$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.queryByRole("menuitem", { name: /invites/i })).not.toBeInTheDocument();
  });

  it("does not surface invites to logged out visitors", () => {
    render(
      <MemoryRouter>
        <TopNav
          isSettingsRoute={false}
          onSignOut={vi.fn()}
          isAuthenticated={false}
          pendingInviteCount={3}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /^navigation menu$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.queryByRole("menuitem", { name: /invites/i })).not.toBeInTheDocument();
  });

  it("shows only About and Log in options when logged out", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} isAuthenticated={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));

    expect(screen.getByRole("menuitem", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /watch history/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /tv mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /log out/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/signed in as/i)).not.toBeInTheDocument();
  });
});
