"use client";

import { useState } from "react";
import type { SavedSpace } from "@/lib/saved-spaces";

interface SavedSpaceSwitcherProps {
  readonly spaces: readonly SavedSpace[];
  readonly activeSpaceId?: string;
  readonly onSelect: (spaceId: string) => void;
  readonly onRename: (spaceId: string, name: string) => void;
  readonly onDelete: (spaceId: string) => void;
  readonly onNew: () => void;
}

export function SavedSpaceSwitcher({
  spaces,
  activeSpaceId,
  onSelect,
  onRename,
  onDelete,
  onNew,
}: SavedSpaceSwitcherProps): React.JSX.Element {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const activeSpace = spaces.find((space) => space.id === activeSpaceId);
  const [draftName, setDraftName] = useState(activeSpace?.name ?? "My space");

  function beginRename(): void {
    setDraftName(activeSpace?.name ?? "My space");
    setIsConfirmingDelete(false);
    setIsRenaming(true);
  }

  function submitRename(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (activeSpaceId === undefined) {
      return;
    }
    onRename(activeSpaceId, draftName);
    setIsRenaming(false);
  }

  return (
    <div className="border-t border-[#17221f]/20 bg-white px-3 py-3">
      <div className="flex items-center gap-2">
        <label htmlFor="saved-space-select" className="sr-only">
          Saved space
        </label>
        <select
          id="saved-space-select"
          value={activeSpaceId ?? ""}
          onChange={(event) => {
            const spaceId = event.target.value;
            if (spaceId.length > 0) {
              onSelect(spaceId);
            }
          }}
          className="fit-data min-h-11 min-w-0 flex-1 rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-2 text-[11px] font-bold"
        >
          {activeSpaceId === undefined ? <option value="">Current space</option> : null}
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onNew}
          className="min-h-11 whitespace-nowrap px-2 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
        >
          Measure new
        </button>
      </div>

      {activeSpace === undefined ? null : isRenaming ? (
        <form onSubmit={submitRename} className="mt-3 flex gap-2">
          <label htmlFor="saved-space-name" className="sr-only">
            Space name
          </label>
          <input
            id="saved-space-name"
            value={draftName}
            maxLength={80}
            onChange={(event) => setDraftName(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-3 text-sm font-semibold"
          />
          <button type="submit" className="min-h-11 px-2 text-xs font-bold">
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsRenaming(false)}
            className="min-h-11 px-2 text-xs font-bold"
          >
            Cancel
          </button>
        </form>
      ) : isConfirmingDelete ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-[#8a4e48] pl-3">
          <p className="text-xs font-semibold">Delete “{activeSpace.name}”?</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onDelete(activeSpace.id)}
              className="min-h-11 px-2 text-xs font-bold text-[#8a4e48]"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="min-h-11 px-2 text-xs font-bold"
            >
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={beginRename}
            className="min-h-11 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRenaming(false);
              setIsConfirmingDelete(true);
            }}
            className="min-h-11 text-xs font-bold underline decoration-[#8a4e48]/50 underline-offset-4"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
