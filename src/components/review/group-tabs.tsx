"use client";

import { useRef, type KeyboardEvent } from "react";

import type { Group } from "@/features/tickets/types";

type GroupTabsProps = {
  groups: Group[];
  activeGroupId: string;
  onChange: (groupId: string) => void;
};

export function GroupTabs({ groups, activeGroupId, onChange }: GroupTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (index: number) => {
    const group = groups[index];
    if (!group) return;
    onChange(group.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (groups.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % groups.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + groups.length) % groups.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = groups.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(nextIndex);
  };

  return (
    <div className="sticky top-[72px] z-30 border-b border-base-300 bg-base-100/95 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-10">
        <div
          role="tablist"
          aria-label="Grupos"
          className="flex min-h-14 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((group, index) => {
            const active = group.id === activeGroupId;
            return (
              <button
                key={group.id}
                ref={(node) => { tabRefs.current[index] = node; }}
                id={`group-tab-${group.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="group-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(group.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`relative min-h-14 shrink-0 px-4 text-sm font-semibold outline-none transition-colors after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] ${
                  active
                    ? "text-base-content after:bg-primary"
                    : "text-base-content/55 after:bg-transparent hover:text-base-content"
                }`}
              >
                {group.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
