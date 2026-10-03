import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, ShieldCheck } from "lucide-react";

import { login } from "../features/auth/api";
import { createDemoAccount } from "../features/account/api";
import { useAuthStore } from "../stores/auth";
import { BrandMark } from "../components/BrandMark";

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

      try {
        await createDemoAccount();
      } catch (accountError: unknown) {
        const axiosError = accountError as {
          response?: {
            status?: number;
          };
        };

        if (axiosError.response?.status !== 409) {
          console.warn("Demo account bootstrap skipped:", accountError);
        }
      }

      navigate("/app", {
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
      <div className="login-layout">
        <section className="login-intro">
          <div className="login-brand-lockup">
            <BrandMark size="large" />
            <div><strong>Gold Trading</strong><span>Paper trading workspace</span></div>
          </div>
          <div className="login-intro__copy">
            <p className="login-kicker"><span /> REALTIME MARKET WORKSPACE</p>
            <h1>Quan sát rõ hơn.<br /><em>Giao dịch kỷ luật hơn.</em></h1>
            <p>Theo dõi XAU/USD với dữ liệu realtime, chart trực quan và lớp bảo vệ tài khoản được xử lý ở backend.</p>
          </div>
          <div className="login-market-card"><div><span><Activity size={14} /> XAUUSD</span><small>Market status</small></div><strong>LIVE</strong><div className="login-market-card__line" /></div>
          <div className="login-intro__trust"><ShieldCheck size={15} /> Demo account · Không rủi ro vốn thật</div>
        </section>

        <section className="login-card">
          <div className="login-title">
          <h2>Đăng nhập</h2>
            <p>Tiếp tục vào workspace của bạn.</p>
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
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div className="login-footer">
          <span>XAUUSD</span><span>•</span><span>Demo Environment</span>
        </div>
      </section>
      </div>
    </main>
  );
}
