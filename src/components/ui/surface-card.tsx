import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

export function SurfaceCard({ children, className }: SurfaceCardProps) {
  return (
    <section className={cn("card border border-base-300 bg-base-100 shadow-sm", className)}>
      <div className="card-body">{children}</div>
    </section>
  );
}
