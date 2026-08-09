import type { Metadata } from "next";
import { AppChrome } from "@/components/app-chrome";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loto Sync",
  description: "Alta movil de boletos y resguardos para grupos de loteria.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem("loto-theme");
                  var isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
                } catch (e) {
                  document.documentElement.setAttribute("data-theme", "light");
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <AppChrome>{children}</AppChrome>
        <ThemeToggle />
      </body>
    </html>
  );
}
