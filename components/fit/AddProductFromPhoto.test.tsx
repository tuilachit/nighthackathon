import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddProductFromPhoto } from "./AddProductFromPhoto";

describe("AddProductFromPhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("generates a candidate scaled to the entered real dimensions, not Meshy's own scale", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onGenerated = vi.fn();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/generate-model/start") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              generation: { status: "pending", taskId: "task-1", mode: "image-to-3d", refinedMeshyPrompt: "a bookcase" },
            }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            generation: {
              status: "succeeded",
              taskId: "task-1",
              glbUrl: "https://assets.meshy.ai/task-1/output/model.glb",
              usdzUrl: "https://assets.meshy.ai/task-1/output/model.usdz",
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AddProductFromPhoto onGenerated={onGenerated} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Width in millimetres"), { target: { value: "778" } });
    fireEvent.change(screen.getByLabelText("Depth in millimetres"), { target: { value: "280" } });
    fireEvent.change(screen.getByLabelText("Height in millimetres"), { target: { value: "840" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Oakridge bookcase"), { target: { value: "Oakridge bookcase" } });

    fireEvent.click(screen.getByRole("button", { name: "Generate 3D model" }));

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));

    const candidate = onGenerated.mock.calls[0][0];
    expect(candidate.name).toBe("Oakridge bookcase");
    expect(candidate.model.dimensions).toEqual({ widthMm: 778, depthMm: 280, heightMm: 840 });
    expect(candidate.model.scaleSource).toBe("generated");
    expect(candidate.model.glbUrl).toBe("/api/model-asset?url=https%3A%2F%2Fassets.meshy.ai%2Ftask-1%2Foutput%2Fmodel.glb");
  });

  it("shows the start error and lets the user retry instead of getting stuck", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Missing MESHY_API_KEY." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AddProductFromPhoto onGenerated={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Oakridge bookcase"), { target: { value: "Oakridge bookcase" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate 3D model" }));

    expect(await screen.findByText("Missing MESHY_API_KEY.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate 3D model" })).toBeInTheDocument();
  });
});
