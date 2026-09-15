import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import "./styles.css";

export const metadata = {
  title: "MSP CRM",
  description: "CRM-first MSP operations workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
