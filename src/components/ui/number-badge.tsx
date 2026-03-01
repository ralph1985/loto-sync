import { cn } from "@/components/ui/cn";

type NumberBadgeProps = {
  value: number | string;
  tone?: "primary" | "accent" | "neutral" | "success";
  className?: string;
};

const TONE_CLASS: Record<NonNullable<NumberBadgeProps["tone"]>, string> = {
  primary: "badge-primary",
  accent: "badge-accent",
  neutral: "badge-neutral",
  success: "badge-success",
};

export function NumberBadge({
  value,
  tone = "neutral",
  className,
}: NumberBadgeProps) {
  return <span className={cn("badge badge-md font-semibold", TONE_CLASS[tone], className)}>{value}</span>;
}
