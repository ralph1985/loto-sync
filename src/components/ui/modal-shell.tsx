"use client";

import { useEffect, type ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type ModalShellProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  panelClassName?: string;
  ariaLabel?: string;
  closeDisabled?: boolean;
};

export function ModalShell({
  children,
  open,
  onClose,
  panelClassName,
  ariaLabel = "Diálogo",
  closeDisabled = false,
}: ModalShellProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDisabled, onClose, open]);

  if (!open) return null;

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div
        className="modal-backdrop bg-base-content/60 backdrop-blur-sm"
        onClick={closeDisabled ? undefined : onClose}
      />
      <section
        className={cn(
          "modal-box relative max-h-[70vh] max-w-2xl overflow-y-auto p-5 sm:p-6",
          panelClassName
        )}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
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
