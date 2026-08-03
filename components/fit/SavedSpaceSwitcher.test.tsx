import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { createSavedSpace } from "@/lib/saved-spaces";
import { SavedSpaceSwitcher } from "./SavedSpaceSwitcher";

const bedroom = createSavedSpace("Bedroom alcove", DEMO_SPACE_MEASUREMENT, {
  id: "bedroom",
  createdAt: "2026-08-01T00:00:00.000Z",
});
const hallway = createSavedSpace("Hallway", DEMO_SPACE_MEASUREMENT, {
  id: "hallway",
  createdAt: "2026-08-02T00:00:00.000Z",
});

describe("SavedSpaceSwitcher", () => {
  it("switches spaces and offers a new measurement", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onNew = vi.fn();
    render(
      <SavedSpaceSwitcher
        spaces={[hallway, bedroom]}
        activeSpaceId="hallway"
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onNew={onNew}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Saved space"), "bedroom");
    expect(onSelect).toHaveBeenCalledWith("bedroom");
    await user.click(screen.getByRole("button", { name: "Measure new" }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("renames and confirms before deleting", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <SavedSpaceSwitcher
        spaces={[hallway]}
        activeSpaceId="hallway"
        onSelect={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onNew={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Space name");
    await user.clear(input);
    await user.type(input, "Front hallway");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith("hallway", "Front hallway");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("hallway");
  });
});
