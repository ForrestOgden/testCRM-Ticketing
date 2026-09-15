import type { ReactNode } from "react";
import "./styles.css";

export const metadata = {
  title: "MSP CRM",
  description: "CRM-first MSP operations workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
