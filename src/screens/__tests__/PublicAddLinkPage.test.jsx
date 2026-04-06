import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  params: { token: "token-1" },
  metadata: {
    status: "active",
    bowlName: "Weekend Bowl",
    remainingAdds: 2,
    defaultContributorName: "Dad",
  },
  consumeResult: {
    bowlName: "Weekend Bowl",
    remainingAdds: 1,
    addedByName: "Dad",
  },
}));

vi.mock("../../lib/addLinks", () => ({
  getAddLinkMetadata: vi.fn(async () => mocks.metadata),
  consumeAddLink: vi.fn(async () => mocks.consumeResult),
}));

vi.mock("../../components/MovieSearch", () => ({
  default: function MockMovieSearch({ onAddMovie }) {
    return (
      <button type="button" onClick={() => onAddMovie({ title: "Jaws" })}>
        Add via Search
      </button>
    );
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => mocks.params,
  };
});

import PublicAddLinkPage from "../PublicAddLinkPage";

describe("PublicAddLinkPage", () => {
  beforeEach(() => {
    mocks.params = { token: "token-1" };
    mocks.metadata = {
      status: "active",
      bowlName: "Weekend Bowl",
      remainingAdds: 2,
      defaultContributorName: "Dad",
    };
    mocks.consumeResult = {
      bowlName: "Weekend Bowl",
      remainingAdds: 1,
      addedByName: "Dad",
    };
  });

  it("loads the token metadata and shows the search UI", async () => {
    render(<PublicAddLinkPage />);

    await waitFor(() => {
      expect(screen.getByText(/add movies to weekend bowl/i)).toBeInTheDocument();
    });

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add via search/i })).toBeInTheDocument();
  });

  it("updates the remaining count after a successful add", async () => {
    render(<PublicAddLinkPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add via search/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/added by/i), {
      target: { value: "Uncle Mike" },
    });
    mocks.consumeResult = {
      bowlName: "Weekend Bowl",
      remainingAdds: 1,
      addedByName: "Uncle Mike",
    };
    fireEvent.click(screen.getAllByRole("button", { name: /add via search/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/movie added as uncle mike\. 1 add remaining\./i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Uncle Mike")).toBeInTheDocument();
  });

  it("shows an unavailable message for exhausted links", async () => {
    mocks.metadata = {
      status: "exhausted",
      bowlName: "Weekend Bowl",
      remainingAdds: 0,
    };

    render(<PublicAddLinkPage />);

    await waitFor(() => {
      expect(screen.getByText(/already been used up/i)).toBeInTheDocument();
    });
  });
});
