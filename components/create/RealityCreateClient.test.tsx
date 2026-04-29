import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealityCreateClient } from "./RealityCreateClient";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("RealityCreateClient", () => {
  it("blocks generate when the prompt is empty", () => {
    render(<RealityCreateClient />);

    fireEvent.change(screen.getByLabelText("Product prompt"), { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Generate Reality MVP" })).toBeDisabled();
  });

  it("shows upload validation errors", () => {
    render(<RealityCreateClient />);

    const input = screen.getByLabelText("Upload sketch or product photo");
    const file = new File([new Uint8Array(128)], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("Upload a sketch or product photo image.")).toBeInTheDocument();
  });

  it("generates the seeded result route", async () => {
    pushMock.mockClear();
    render(<RealityCreateClient />);

    fireEvent.click(screen.getByRole("button", { name: "Generate Reality MVP" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/result/smart-hydration-bottle");
    });
  });
});
