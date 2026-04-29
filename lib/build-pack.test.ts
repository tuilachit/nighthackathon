import { describe, expect, it } from "vitest";
import { analyzePromptToPrototype } from "./analyzer";
import { generateBuildPack } from "./build-pack";

describe("generateBuildPack", () => {
  it("emits the required files and Codex framing", () => {
    const spec = analyzePromptToPrototype("A <script>alert(1)</script> smart water bottle");
    const buildPack = generateBuildPack(spec);

    expect(buildPack.files.map((file) => file.path)).toEqual([
      "app/ar/[id]/page.tsx",
      "product.config.json",
      "AGENTS.md",
      "MVP_SPEC.md",
      "VALIDATION_PLAN.md",
      "README.md",
    ]);
    expect(buildPack.files.find((file) => file.path === "README.md")?.content).toContain(
      "Codex to generate the runnable spatial prototype app layer",
    );
  });
});
