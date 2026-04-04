import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type ModalShellProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  panelClassName?: string;
};

export function ModalShell({
  children,
  open,
  onClose,
  panelClassName,
}: ModalShellProps) {
  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-backdrop bg-base-content/60 backdrop-blur-sm" onClick={onClose} />
      <section
        className={cn(
          "modal-box relative max-h-[70vh] max-w-2xl overflow-y-auto p-5 sm:p-6",
          panelClassName
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          className="btn btn-circle btn-sm btn-ghost absolute right-3 top-3 z-20"
        >
          ✕
        </button>
        <div className="pr-8">{children}</div>
      </section>
    </div>
  );
}
