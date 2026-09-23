import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";

import AuthLayout from "../layouts/Auth";
import { DashboardLayout } from "../layouts/Dashboard";
import { DashboardPage } from "../pages/Dashboard";
import { MarketPage, TradePage, PositionsPage, HistoryPage } from "../pages/TradingTabs";
import { Login } from "../pages/Login";
import { useAuthStore } from "../stores/auth";

function ProtectedRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return accessToken ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return accessToken ? <Navigate to="/" replace /> : <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: "/login", element: <Login /> }],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/market", element: <MarketPage /> },
          { path: "/trade", element: <TradePage /> },
          { path: "/positions", element: <PositionsPage /> },
          { path: "/history", element: <HistoryPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
