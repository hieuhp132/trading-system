import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <main className="main-auth-layout">
      <section className="section-auth">
        <Outlet />
      </section>
    </main>
  );
}
