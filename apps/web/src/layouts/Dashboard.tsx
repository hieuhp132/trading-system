import { NavLink, Outlet } from "react-router-dom";
import {
  House,
  ArrowLeftRight,
  BriefcaseBusiness,
  History,
  CandlestickChart,
  Settings,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark";

import "./app-shell.css";

const navigation = [
  { to: "/app", label: "Home", icon: House, end: true },
  { to: "/market", label: "Market", icon: CandlestickChart },
  { to: "/trade", label: "Trade", icon: ArrowLeftRight },
  { to: "/positions", label: "Positions", icon: BriefcaseBusiness },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Navigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Main navigation">
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `app-nav__item${isActive ? " app-nav__item--active" : ""}`
          }
        >
          <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function DashboardLayout() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <BrandMark size="large" />
          <div>
            <strong>Gold Trading</strong>
            <small>Paper trading</small>
          </div>
        </div>

        <Navigation className="app-nav app-nav--desktop" />

        <div className="app-sidebar__footer">XAUUSD · Paper</div>
      </aside>

      <div className="app-shell__workspace">
        <header className="app-topbar">
          <div className="app-topbar__status" aria-label="Paper trading mode">
            <span className="app-topbar__status-dot" aria-hidden="true" />
            <span>Paper trading</span>
          </div>
        </header>

        <main className="app-content" id="main-content">
          <Outlet />
        </main>
      </div>

      <Navigation className="app-nav app-nav--mobile" />
    </div>
  );
}
