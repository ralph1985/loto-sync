import type { ReactNode } from "react";

type DashboardSectionProps = {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function DashboardSection({ id, title, description, open, onToggle, children }: DashboardSectionProps) {
  return (
    <section className="rounded-3xl border border-base-300 bg-base-100 shadow-sm" aria-labelledby={`${id}-title`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
      >
        <span>
          <span id={`${id}-title`} className="block text-lg font-bold tracking-tight text-base-content">{title}</span>
          <span className="mt-1 block text-sm text-base-content/65">{description}</span>
        </span>
        <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-base-300 text-lg transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open ? <div id={`${id}-content`} className="border-t border-base-300 p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}
