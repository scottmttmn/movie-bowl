import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import VoiceProbePrivacyPage from "../VoiceProbePrivacyPage";
import { SUPPORT_EMAIL } from "../../lib/appConfig";

describe("VoiceProbePrivacyPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("states the probe's complete data handling behavior", () => {
    render(<VoiceProbePrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByText(/does not collect, transmit, sell, or share/i)).toBeInTheDocument();
    expect(screen.getByText(/does not access the microphone or record audio/i)).toBeInTheDocument();
    expect(screen.getByText(/does not write App Action values to local storage/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
  });
});
