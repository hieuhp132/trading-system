import { Navigate, createBrowserRouter } from "react-router-dom";

import AuthLayout from "../layouts/Auth";
import { DashboardLayout } from "../layouts/Dashboard";
import { DashboardPage } from "../pages/Dashboard";
import { HomePage } from "../pages/HomePage";
import { LandingPage } from "../pages/LandingPage";
import { NewsPage } from "../pages/NewsPage";
import { PublicLayout } from "../layouts/Public";
import { MarketPage, TradePage, PositionsPage, HistoryPage } from "../pages/TradingTabs";
import { Login } from "../pages/Login";
import { ProtectedRoute } from "./ProtectedRoute";
import { DevelopingPage } from "../pages/DevelopingPage";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/landing", element: <LandingPage /> },
      { path: "/news", element: <NewsPage /> },
    ],
  },
  {
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
          { path: "/app", element: <DashboardPage /> },
          { path: "/market", element: <MarketPage /> },
          { path: "/trade", element: <TradePage /> },
          { path: "/positions", element: <PositionsPage /> },
          { path: "/history", element: <HistoryPage /> },
          { path: "/settings", element: <DevelopingPage eyebrow="SETTINGS" title="Cài đặt đang được phát triển" description="Các tuỳ chỉnh tài khoản và trải nghiệm sẽ sớm có mặt tại đây." /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
