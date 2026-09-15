"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/tickets", label: "Tickets", icon: "▤", badge: "14" },
  { href: "/clients", label: "Clients", icon: "◉" },
  { href: "/contacts", label: "Contacts", icon: "◎" },
  { href: "/devices", label: "Devices", icon: "▣" },
  { href: "/pipeline", label: "Pipeline", icon: "◇" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/reports", label: "Reports", icon: "◫" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brandMark">
          <div className="brandIcon">M</div>
          <div>
            <div className="brand">MSP<span>CRM</span></div>
            <div className="brandSub">Support. Relationships. Context.</div>
          </div>
        </div>

        <nav className="sideNav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              className={isActive(pathname, item.href) ? "nav active" : "nav"}
              href={item.href}
              key={item.href}
            >
              <span className="navIcon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge ? <span className="navBadge">{item.badge}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="sidebarFooter">
          <Link className={isActive(pathname, "/settings") ? "nav active" : "nav"} href="/settings">
            <span className="navIcon">⚙</span>
            <span>Settings</span>
          </Link>
          <div className="signedInUser">
            <div className="userAvatar">FO</div>
            <div>
              <strong>Forrest</strong>
              <span>Technician</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="appColumn">
        <header className="globalBar">
          <div className="globalSearch">
            <span>⌕</span>
            <span className="searchPlaceholder">Search clients, tickets, devices, contacts...</span>
            <kbd>Ctrl K</kbd>
          </div>
          <div className="globalActions">
            <button className="iconButton" aria-label="Notifications">●</button>
            <div className="profilePill">
              <div className="userAvatar smallAvatar">FO</div>
              <span>Forrest</span>
            </div>
          </div>
        </header>
        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}
