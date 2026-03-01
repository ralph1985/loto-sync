import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type PageShellProps = {
  children: ReactNode;
  mainClassName?: string;
  className?: string;
};

export function PageShell({ children, className, mainClassName }: PageShellProps) {
  return (
    <div className={cn("relative min-h-screen bg-base-200 text-base-content", className)}>
      <main className={cn("relative mx-auto w-full max-w-4xl px-4 pb-24 pt-10 md:px-10 md:pt-14", mainClassName)}>
        {children}
      </main>
    </div>
  );
}
