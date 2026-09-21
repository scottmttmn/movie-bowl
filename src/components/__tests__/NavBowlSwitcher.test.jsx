import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import NavBowlSwitcher from "../NavBowlSwitcher";
import TopNav from "../TopNav";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const state = vi.hoisted(() => ({
  bowls: [],
  defaultBowlId: null,
  loading: false,
  error: null,
  createResult: { ok: true, bowl: { id: "bowl-new" } },
}));

const createHook = vi.hoisted(() => ({
  close: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  setBowlName: vi.fn(),
  setInviteEmails: vi.fn(),
  isOpen: false,
}));

vi.mock("../../hooks/useUserBowls", () => ({
  default: () => ({
    bowls: state.bowls,
    defaultBowlId: state.defaultBowlId,
    loading: state.loading,
    error: state.error,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../hooks/useCreateBowl", () => ({
  default: () => ({
    actionMessage: null,
    bowlName: "",
    close: createHook.close,
    create: createHook.create,
    errorMessage: null,
    inviteEmails: "",
    isCreating: false,
    isLimitReached: false,
    isOpen: createHook.isOpen,
    open: createHook.open,
    setBowlName: createHook.setBowlName,
    setInviteEmails: createHook.setInviteEmails,
  }),
}));

const renderSwitcher = (name = "Movie night") =>
  render(<MemoryRouter><NavBowlSwitcher homeBowlName={name} /></MemoryRouter>);

describe("NavBowlSwitcher", () => {
  beforeEach(() => {
    state.bowls = [
      { id: "bowl-home", name: "Movie night", role: "Owner", remainingCount: 14, memberCount: 2 },
      { id: "bowl-other", name: "Date night", role: "Owner", remainingCount: 6, memberCount: 2 },
      { id: "bowl-shared", name: "Horror club", role: "Member", remainingCount: 31, memberCount: 6 },
    ];
    state.defaultBowlId = "bowl-home";
    state.loading = false;
    state.error = null;
    createHook.isOpen = false;
    createHook.create.mockResolvedValue(state.createResult);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("names the home bowl and opens the picker", () => {
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "Switch bowl. Home bowl: Movie night" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose a bowl" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Movie night, home bowl/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Horror club/ })).toBeInTheDocument();
  });

  // Away from a bowl there is no bowl in view to designate, so the picker must
  // not offer to move Home -- and must never claim a bowl is the current one.
  it("offers no home command and marks no row current", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Switch bowl/ }));
    expect(screen.queryByRole("button", { name: /my home bowl/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /current bowl/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new bowl" })).toBeInTheDocument();
  });

  it("navigates to the chosen bowl and closes", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Switch bowl/ }));
    fireEvent.click(screen.getByRole("button", { name: /Date night/ }));
    expect(navigate).toHaveBeenCalledWith("/bowl/bowl-other");
    expect(screen.queryByRole("dialog", { name: "Choose a bowl" })).not.toBeInTheDocument();
  });

  it("opens the create dialog from the picker", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Switch bowl/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create new bowl" }));
    expect(createHook.open).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Choose a bowl" })).not.toBeInTheDocument();
  });

  it("goes to a newly created bowl", async () => {
    createHook.isOpen = true;
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/bowl/bowl-new"));
  });

  it("stays put when creation fails", async () => {
    createHook.isOpen = true;
    createHook.create.mockResolvedValue({ ok: false, errorMessage: "Nope" });
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createHook.create).toHaveBeenCalledOnce());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces a failed bowl context with Retry rather than an empty list", () => {
    state.bowls = [];
    state.defaultBowlId = null;
    state.error = "Could not load your bowls. Please try again.";
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: /Switch bowl/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load your bowls.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("TopNav bowl switcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("replaces the wordmark away from a bowl", () => {
    render(
      <MemoryRouter>
        <TopNav showBowlSwitcher homeBowlName="Movie night" homeBowlId="bowl-home" />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /Switch bowl. Home bowl: Movie night/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to your home bowl" })).not.toBeInTheDocument();
  });

  // Until the account context answers there is no name to show, and a header
  // that flickers between two controls is worse than the one that always works.
  it("keeps the wordmark while no home bowl is known", () => {
    render(
      <MemoryRouter>
        <TopNav showBowlSwitcher homeBowlName="" homeBowlId={null} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /Switch bowl/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your home bowl" })).toHaveAttribute("href", "/");
  });

  it("keeps the wordmark on a bowl, where the page carries its own picker", () => {
    render(
      <MemoryRouter>
        <TopNav showBowlSwitcher={false} homeBowlName="Movie night" homeBowlId="bowl-home" />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /Switch bowl/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your home bowl" })).toHaveAttribute("href", "/bowl/bowl-home");
  });
});
