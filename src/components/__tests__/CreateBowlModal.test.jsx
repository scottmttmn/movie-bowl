import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreateBowlModal from "../CreateBowlModal";

describe("CreateBowlModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render when closed", () => {
    render(
      <CreateBowlModal
        isOpen={false}
        bowlName=""
        inviteEmails=""
        maxContributionLead=""
        onChangeBowlName={vi.fn()}
        onChangeInviteEmails={vi.fn()}
        onChangeMaxContributionLead={vi.fn()}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("Create New Bowl")).not.toBeInTheDocument();
  });

  it("renders values and forwards field changes", () => {
    const onChangeBowlName = vi.fn();
    const onChangeInviteEmails = vi.fn();
    const onChangeMaxContributionLead = vi.fn();

    render(
      <CreateBowlModal
        isOpen
        bowlName="Friday Bowl"
        inviteEmails="friend@example.com"
        maxContributionLead="2"
        onChangeBowlName={onChangeBowlName}
        onChangeInviteEmails={onChangeInviteEmails}
        onChangeMaxContributionLead={onChangeMaxContributionLead}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Bowl Name"), { target: { value: "Weekend Bowl" } });
    fireEvent.change(screen.getByLabelText(/invite emails \(optional\)/i), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText(/max contribution lead \(optional\)/i), { target: { value: "3" } });

    expect(onChangeBowlName).toHaveBeenCalledWith("Weekend Bowl");
    expect(onChangeInviteEmails).toHaveBeenCalledWith("a@example.com");
    expect(onChangeMaxContributionLead).toHaveBeenCalledWith("3");
  });

  it("calls create on button click and enter key, and cancel on close", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateBowlModal
        isOpen
        bowlName="Friday Bowl"
        inviteEmails=""
        maxContributionLead=""
        onChangeBowlName={vi.fn()}
        onChangeInviteEmails={vi.fn()}
        onChangeMaxContributionLead={vi.fn()}
        onCreate={onCreate}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(screen.getByPlaceholderText("Bowl Name"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
