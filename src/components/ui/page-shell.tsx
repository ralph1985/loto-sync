import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

type PageShellProps = {
  children: ReactNode;
  mainClassName?: string;
  className?: string;
};

export function PageShell({ children, className, mainClassName }: PageShellProps) {
  return (
    <div className={cn("relative min-h-[100dvh] bg-transparent text-base-content", className)}>
      <main className={cn("relative mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:px-10 md:pb-20 md:pt-12", mainClassName)}>
        {children}
      </main>
    </div>
  );
}
