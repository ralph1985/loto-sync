import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type InlineAlertProps = {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  className?: string;
};

const TONE_CLASS: Record<NonNullable<InlineAlertProps["tone"]>, string> = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

export function InlineAlert({ children, tone = "info", className }: InlineAlertProps) {
  return (
    <div className={cn("alert rounded-xl py-2.5 text-sm leading-5", TONE_CLASS[tone], className)} role="alert">
      <span>{children}</span>
    </div>
  );
}
