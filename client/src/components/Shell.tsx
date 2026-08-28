import { NavLink, Outlet, Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";

/**
 * The Milieu lockup. "Milieu" is live text in the interface's own colour, not
 * part of the image, so it inverts correctly in dark mode and stays readable
 * to a screen reader. The image contributes the rings and nothing else.
 */
function Lockup() {
  return (
    <Link
      to="/"
      className="lockup"
      role="img"
      aria-label="Milieu Family Services"
    >
      <img src="/milieu-rings.png" alt="" width={38} height={35} />
      <span className="wordmark" style={{ fontSize: 20 }}>
        Milieu
      </span>
    </Link>
  );
}

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/interview/new", label: "Start an interview", end: false },
  { to: "/library", label: "Interview library", end: false },
  { to: "/history", label: "Past interviews", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export function Shell() {
  const { user, signOut } = useSession();
  const { theme, toggle } = useTheme();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Lockup />

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
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={toggle}
            style={{ width: "100%" }}
          >
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>

          <div>
            <div style={{ color: "var(--color-text)", fontWeight: 600 }}>
              {user?.name}
            </div>
            <div>{user?.role === "admin" ? "Administrator" : "Staff"}</div>
          </div>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void signOut()}
            style={{ justifyContent: "flex-start", padding: 0 }}
          >
            Sign out
          </button>

          {/* SNRGY owns one line of the footer and never competes with Milieu. */}
          <span className="powered-by">Powered by SNRGY</span>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
