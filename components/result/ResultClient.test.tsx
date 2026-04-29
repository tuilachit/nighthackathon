import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { analyzePromptToPrototype } from "@/lib/analyzer";
import { savePrototypeToLocalStorage } from "@/lib/local-prototype-store";
import { applyGeneratedModelResult } from "@/lib/model-generation";
import { ResultClient } from "./ResultClient";

describe("ResultClient", () => {
  it("hydrates the latest generated model when opened from the generic route", async () => {
    const placeholder = analyzePromptToPrototype("");
    const generated = applyGeneratedModelResult(analyzePromptToPrototype("wearable sensor with visible vents"), {
      id: "generated-model",
      mode: "text-to-3d",
      status: "succeeded",
      glbUrl: "https://assets.meshy.ai/users/abc/tasks/123/output/model.glb?Expires=4931020800&Signature=test",
      refinedMeshyPrompt: "wearable sensor with visible vents",
      fallbackModelPath: "/models/bottle.glb",
    });

    savePrototypeToLocalStorage(generated);
    const { container } = render(<ResultClient prototype={placeholder} />);

    expect(await screen.findByRole("heading", { name: generated.name })).toBeInTheDocument();
    expect(screen.getByText("Generated model linked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Launch Page" })).toHaveAttribute("href", `/launch/${generated.id}`);
    expect(container.querySelector("model-viewer")).toHaveAttribute(
      "src",
      `/api/model-asset?url=${encodeURIComponent(generated.model.remoteModelUrl ?? "")}`,
    );
  });
});
