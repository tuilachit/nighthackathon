import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealityCreateClient } from "./RealityCreateClient";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("RealityCreateClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks generate when the prompt is empty", () => {
    render(<RealityCreateClient />);

    fireEvent.change(screen.getByLabelText("Product prompt"), { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Answer product questions" })).toBeDisabled();
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
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/refine-concept")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                refinement: {
                  source: "fallback",
                  visualDirection: "Use a clear color palette.",
                  generationBrief: "Founder wants a smart bottle.",
                  promptAdditions: ["Add logo placement.", "Use material contrast.", "Make the LED visible."],
                  questions: [
                    { id: "brand", label: "Brand", placeholder: "OpenAI logo" },
                    { id: "colors", label: "Colors", placeholder: "black and green" },
                    { id: "materials", label: "Materials", placeholder: "metal and silicone" },
                    { id: "detail", label: "Detail", placeholder: "LED ring" },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              generation: {
                status: "failed",
                mode: "text-to-3d",
                refinedMeshyPrompt: "fallback",
                fallbackModelPath: "/models/bottle.glb",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }),
    );
    render(<RealityCreateClient />);

    fireEvent.click(screen.getByRole("button", { name: "Answer product questions" }));

    await screen.findByText("Brand");
    fireEvent.click(screen.getByRole("button", { name: "Generate Reality MVP" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/result/smart-hydration-bottle");
    });
  });
});
