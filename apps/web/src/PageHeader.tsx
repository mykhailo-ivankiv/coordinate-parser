import { NavLink } from "react-router";

const pages = [
  { to: "/", label: "Парсер" },
  { to: "/convert", label: "Конвертер" },
  { to: "/guide", label: "Довідник" },
  { to: "/api", label: "API" },
];

const Navigation = () => (
  <nav className="inline-flex rounded-full border bg-white p-0.5 text-sm">
    {pages.map(({ to, label }) => (
      <NavLink
        key={to}
        to={to}
        end
        className={({ isActive }) =>
          `rounded-full px-3 py-1 ${isActive ? "bg-ink text-paper" : "opacity-70 hover:opacity-100"}`
        }
      >
        {label}
      </NavLink>
    ))}
  </nav>
);

/** The tabs, the page's title and one line on what it is for. */
export const PageHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <header>
    <Navigation />
    <h1 className="mt-5 text-2xl font-bold tracking-tight">{title}</h1>
    <p className="mt-1 mb-4 text-sm opacity-60">{subtitle}</p>
  </header>
);
