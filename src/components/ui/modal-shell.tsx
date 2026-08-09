"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closeDisabledRef = useRef(closeDisabled);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
    onCloseRef.current = onClose;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabledRef.current) onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div
        className="modal-backdrop bg-base-content/60 backdrop-blur-sm"
        aria-hidden="true"
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
          ref={closeButtonRef}
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
