import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DIRECTION, LOCALE } from "@/lib/locale";

import "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Acme", template: "%s · Acme" },
};

// Language and direction come from the locale module (decision D6), never
// typed in here.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={LOCALE} dir={DIRECTION}>
      <body>{children}</body>
    </html>
  );
}
