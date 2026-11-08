import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HelpSheet from "../HelpSheet";
import { getHelpTopic } from "../../utils/helpTopics";

function Landed() {
  const location = useLocation();
  return <output data-testid="landed">{`${location.pathname} ${location.state?.helpTarget ?? ""}`}</output>;
}

function renderSheet(props) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={["/bowl/b1"]}>
      <Routes><Route path="*" element={<><HelpSheet onClose={onClose} bowlId="b1" {...props} /><Landed /></>} /></Routes>
    </MemoryRouter>
  );
  return { onClose };
}

const askQuestion = async (text) => {
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ask" })); });
};

describe("HelpSheet", () => {
  afterEach(cleanup);

  it("offers nothing to press until there is a question", () => {
    renderSheet({ ask: vi.fn() });
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();
  });

  it("answers with the guide's line and takes you to the setting, naming what to ring", async () => {
    const ask = vi.fn(async () => getHelpTopic("solo_draw_removal"));
    const { onClose } = renderSheet({ ask });
    await askQuestion("  remove a movie I watched alone ");
    expect(ask).toHaveBeenCalledWith("remove a movie I watched alone");
    expect(screen.getByText(getHelpTopic("solo_draw_removal").answer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Solo draw setting" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("landed")).toHaveTextContent("/settings remove-from-bowls-on-solo-draw");
  });

  it("sends a bowl topic to the bowl it was given", async () => {
    renderSheet({ ask: async () => getHelpTopic("filters") });
    await askQuestion("only short movies");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByTestId("landed")).toHaveTextContent("/bowl/b1 bowl-filters");
  });

  it("turns a question with no answer into feedback in one tap", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    renderSheet({ ask: async () => null, send });
    await askQuestion("can it pick a restaurant");
    expect(screen.getByText("No answer for that.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send as feedback" })); });
    expect(send).toHaveBeenCalledWith({ message: "can it pick a restaurant", errorText: "", page: null });
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("holds the question still while it is being sent as feedback", async () => {
    let finish;
    renderSheet({ ask: async () => null, send: () => new Promise((done) => { finish = done; }) });
    await askQuestion("dark mode please");
    fireEvent.click(screen.getByRole("button", { name: "Send as feedback" }));
    expect(screen.getByRole("textbox", { name: "Question" })).toBeDisabled();
    await act(async () => { finish({ ok: true }); });
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("says why feedback did not send and keeps the question", async () => {
    renderSheet({ ask: async () => null, send: async () => ({ ok: false, message: "Ten an hour." }) });
    await askQuestion("dark mode please");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send as feedback" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Ten an hour.");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("dark mode please");
  });

  it("drops an answer to a question that has since been edited", async () => {
    let resolve;
    renderSheet({ ask: () => new Promise((done) => { resolve = done; }) });
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "invite" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "invite my sister" } });
    await act(async () => { resolve(getHelpTopic("invite_people")); });
    expect(screen.queryByText(getHelpTopic("invite_people").answer)).not.toBeInTheDocument();
  });
});
