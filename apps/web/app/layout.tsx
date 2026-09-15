import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell";
import { AuthProvider } from "../components/AuthProvider";
import "./styles.css";
import "./functional.css";

export const metadata = {
  title: "MSP CRM",
  description: "CRM-first MSP operations workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
