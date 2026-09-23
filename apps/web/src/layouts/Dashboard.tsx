import { NavLink, Outlet } from "react-router-dom";
import {
  House,
  ChartCandlestick,
  ArrowLeftRight,
  BriefcaseBusiness,
  History,
  Gem,
} from "lucide-react";

import "./app-shell.css";

const navigation = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/market", label: "Market", icon: ChartCandlestick },
  { to: "/trade", label: "Trade", icon: ArrowLeftRight },
  { to: "/positions", label: "Positions", icon: BriefcaseBusiness },
  { to: "/history", label: "History", icon: History },
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
          <span className="app-brand__icon">
            <Gem size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>Trading System</strong>
            <small>Paper trading</small>
          </div>
        </div>

        <Navigation className="app-nav app-nav--desktop" />

        <div className="app-sidebar__footer">XAUUSD · Demo</div>
      </aside>

      <div className="app-shell__workspace">
        <header className="app-topbar">
          <div className="app-topbar__brand">
            <Gem size={23} aria-hidden="true" />
            <strong>Trading System</strong>
          </div>
          <span className="app-demo-badge">DEMO</span>
        </header>

        <main className="app-content" id="main-content">
          <Outlet />
        </main>
      </div>

      <Navigation className="app-nav app-nav--mobile" />
    </div>
  );
}
