"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth, userInitials } from "./AuthProvider";

const navigation = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/tickets", label: "Tickets", icon: "▤" },
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
  const router = useRouter();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");

  function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/search?q=${encodeURIComponent(value)}`);
  }

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
            </Link>
          ))}
        </nav>

        <div className="sidebarFooter">
          <Link className={isActive(pathname, "/settings") ? "nav active" : "nav"} href="/settings">
            <span className="navIcon">⚙</span>
            <span>Settings</span>
          </Link>
          <button className="signedInUser userButton" type="button" onClick={() => void logout()} title="Sign out">
            <div className="userAvatar">{userInitials(user)}</div>
            <div>
              <strong>{user?.displayName ?? "Signed in"}</strong>
              <span>{user?.email ?? ""}</span>
            </div>
          </button>
        </div>
      </aside>

      <div className="appColumn">
        <header className="globalBar">
          <form className="globalSearch" onSubmit={search}>
            <span>⌕</span>
            <input
              aria-label="Global search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients, tickets, devices, contacts..."
            />
            <kbd>Enter</kbd>
          </form>
          <div className="globalActions">
            <Link className="iconButton" aria-label="Settings" href="/settings">⚙</Link>
            <div className="profilePill">
              <div className="userAvatar smallAvatar">{userInitials(user)}</div>
              <span>{user?.displayName ?? "User"}</span>
            </div>
          </div>
        </header>
        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}
