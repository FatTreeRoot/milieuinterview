import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../lib/session";
import { ThemeToggle } from "./ui";
import { Lockup, PoweredBy } from "./Brand";

// Starting an interview is a Home page action rather than a nav destination.
const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/dashboard", label: "Dashboard", end: false },
  { to: "/library", label: "Interview Library", end: false },
  { to: "/history", label: "Interview History", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export function Shell() {
  const { user, signOut } = useSession();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Lockup height={40} />

        <nav className="nav" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div>
            <div style={{ color: "var(--color-text)", fontWeight: 600 }}>
              {user?.name}
            </div>
            <div>{user?.role === "admin" ? "Administrator" : "Staff"}</div>
          </div>

          <div className="row-between">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void signOut()}
              style={{ justifyContent: "flex-start", padding: 0 }}
            >
              Sign Out
            </button>
            <ThemeToggle />
          </div>

          <PoweredBy />
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
