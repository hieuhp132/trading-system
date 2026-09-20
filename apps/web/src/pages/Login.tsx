import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../features/auth/api";
import { useAuthStore } from "../stores/auth";

export function Login() {
  const navigate = useNavigate();

  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const result = await login({
        email: email.trim(),
        password,
      });

      setAuth(result.user, result.accessToken);

      navigate("/", {
        replace: true,
      });
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          data?: {
            error?: {
              message?: string;
            };
          };
        };
      };

      const message =
        axiosError.response?.data?.error?.message ?? "Đăng nhập thất bại";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-header">
          <div className="login-logo">G</div>

          <div>
            <h1>Gold Trading</h1>
            <p>Paper Trading Platform</p>
          </div>
        </div>

        <div className="login-title">
          <h2>Đăng nhập</h2>

          <p>Đăng nhập vào tài khoản paper trading của bạn.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div className="login-footer">
          <span>XAUUSD</span>
          <span>•</span>
          <span>Demo Environment</span>
        </div>
      </section>
    </main>
  );
}
