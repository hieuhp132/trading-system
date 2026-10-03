import { NavLink, Outlet, Link } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "../components/BrandMark";

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link to="/" className="public-brand" onClick={() => setMenuOpen(false)}>
          <BrandMark />
          <span>Gold Trading</span>
        </Link>

        <button
          className="public-nav__toggle"
          type="button"
          aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <nav className={`public-nav__links${menuOpen ? " public-nav__links--open" : ""}`} aria-label="Public navigation">
          <NavLink to="/" end onClick={() => setMenuOpen(false)}>Trang chủ</NavLink>
          <NavLink to="/landing" onClick={() => setMenuOpen(false)}>Giới thiệu</NavLink>
          <NavLink to="/news" onClick={() => setMenuOpen(false)}>Tin tức</NavLink>
        </nav>

        <div className="public-nav__actions">
          <Link to="/login" className="public-button public-button--quiet">Đăng nhập</Link>
          <Link to="/login" className="public-button public-button--gold">Bắt đầu <ArrowUpRight size={16} /></Link>
        </div>
      </header>

      <Outlet />

      <footer className="public-footer">
        <div className="public-brand"><BrandMark /><span>Gold Trading</span></div>
        <span>Paper trading với dữ liệu thị trường realtime.</span>
        <span>© 2026 Gold Trading</span>
      </footer>
    </div>
  );
}
