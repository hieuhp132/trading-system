import { Outlet } from "react-router-dom";

export function DashboardLayout() {
  return (
    <main className="main-dashboard-layout">
      <Outlet />
    </main>
  );
}
