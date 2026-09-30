import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import useProviderLaunchError from "../useProviderLaunchError";

function reportFailure(message) {
  window.dispatchEvent(new CustomEvent("moviebowl:provider-launch-error", { detail: { message } }));
}

function pressLink(href) {
  const link = document.createElement("a");
  link.href = href;
  link.addEventListener("click", (event) => event.preventDefault());
  const label = document.createElement("span");
  link.append(label);
  document.body.append(link);
  label.click();
  return link;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useProviderLaunchError", () => {
  it("files a failure under the link that was last pressed", () => {
    const { result } = renderHook(() => useProviderLaunchError());

    act(() => {
      pressLink("https://www.watchmode.com/");
      reportFailure("That app isn't installed.");
    });

    expect(result.current.launchError).toEqual({
      message: "That app isn't installed.",
      url: "https://www.watchmode.com/",
    });

    act(() => result.current.clearLaunchError());
    expect(result.current.launchError).toBeNull();
  });

  it("files a failure under an auto-start, and says nothing of a destination it never saw", () => {
    const { result } = renderHook(() => useProviderLaunchError());

    act(() => reportFailure());
    expect(result.current.launchError).toEqual({
      message: "That streaming app could not be opened on this TV.",
      url: null,
    });

    act(() => {
      result.current.noteLaunch("https://www.netflix.com/title/1");
      reportFailure("Netflix isn't installed.");
    });
    expect(result.current.launchError.url).toBe("https://www.netflix.com/title/1");
  });
});
