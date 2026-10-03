import { ArrowRight, BarChart3, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketAurora } from "../components/MarketAurora";

const watchlist = [
  { symbol: "XAUUSD", value: "4,280.56", change: "+1.84%", trend: "up" },
  { symbol: "USDJPY", value: "152.74", change: "+0.42%", trend: "up" },
  { symbol: "BTCUSD", value: "113,842.00", change: "-0.18%", trend: "down" },
];

const experienceCards = [
  { title: "Theo dõi thị trường", text: "Live feed với các cặp trọng tâm và chỉ báo phản ứng nhanh.", icon: BarChart3 },
  { title: "Risk kiểm soát", text: "Quản lý stop loss, vị thế và cảnh báo trước các nhịp bất lợi.", icon: ShieldCheck },
  { title: "Workflow rõ ràng", text: "Thiết kế tối ưu cho màn hình nhỏ, dễ dùng trên mobile và desktop.", icon: Sparkles },
];

const homeHighlights = [
  { label: "Market pulse", value: "24/7", note: "Theo dõi liên tục sau khung giờ" },
  { label: "Active alerts", value: "18", note: "Cảnh báo đang theo dõi thị trường" },
  { label: "Execution flow", value: "3s", note: "Thời gian phản ứng trung bình" },
];

export function HomePage() {
  return (
    <main className="home-page">
      <div className="home-scene" aria-hidden="true">
        <MarketAurora className="home-scene__aurora" />
        <div className="home-scene__orb home-scene__orb--gold" />
        <div className="home-scene__orb home-scene__orb--blue" />
        <div className="home-scene__ring home-scene__ring--one" />
        <div className="home-scene__ring home-scene__ring--two" />
      </div>

      <section className="home-hero">
        <div className="home-hero__content">
          <p className="eyebrow home-hero__eyebrow">
            <span className="eyebrow__dot" /> Live market workspace
          </p>

          <h1>
            Theo dõi nhịp
            <br />
            <span>điều kiện thị trường.</span>
          </h1>

          <p className="home-hero__lead">
            Một không gian giao dịch realtime giúp bạn quan sát nhanh, phản ứng đúng nhịp và
            ra quyết định rõ ràng trước những biến động lớn.
          </p>

          <div className="home-hero__actions">
            <Link to="/login" className="public-button public-button--gold public-button--large">
              Mở tài khoản demo <ArrowRight size={18} />
            </Link>
            <Link to="/landing" className="text-link">
              Đọc tin thị trường <ArrowRight size={15} />
            </Link>
          </div>

          <div className="home-hero__trust">
            <span>
              <ShieldCheck size={15} /> Không dùng vốn thật
            </span>
            <span>
              <TrendingUp size={15} /> Dữ liệu realtime
            </span>
          </div>
        </div>

        <div className="home-visual" aria-label="3D market visualization">
          <div className="home-visual__scene">
            <div className="home-visual__ring" />
            <div className="home-visual__panel">
              <div className="home-visual__header">
                <span>Portfolio</span>
                <span className="live-pill">LIVE</span>
              </div>
              <div className="home-visual__value">
                <strong>+8.42%</strong>
                <small>30d performance</small>
              </div>
              <div className="home-visual__track">
                <span />
              </div>
              <div className="home-visual__tags">
                <span>BTC</span>
                <span>EURUSD</span>
                <span>NASDAQ</span>
              </div>
            </div>
            <div className="home-visual__coin home-visual__coin--gold">XAU</div>
            <div className="home-visual__coin home-visual__coin--blue">BTC</div>
          </div>
        </div>
      </section>

      <section className="home-highlights" aria-label="Market highlights">
        {homeHighlights.map((item) => (
          <article key={item.label} className="home-highlight-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <section className="home-overview">
        <div className="home-overview__header">
          <p className="eyebrow home-overview__eyebrow">
            <span className="eyebrow__dot" /> Overview
          </p>
          <h2>Theo dõi các biến động chính</h2>
          <Link to="/news" className="text-link home-overview__link">
            Tin tức mới <ArrowRight size={15} />
          </Link>
        </div>

        <div className="home-watchlist">
          {watchlist.map((item) => (
            <article key={item.symbol} className="home-watch-card">
              <div className="home-watch-card__meta">
                <span>{item.symbol}</span>
                <strong className={item.trend === "up" ? "is-positive" : "is-negative"}>{item.change}</strong>
              </div>
              <div className="home-watch-card__body">
                <strong>{item.value}</strong>
                <span className="home-watch-card__spark">
                  <BarChart3 size={18} />
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-experience">
        {experienceCards.map(({ title, text, icon: Icon }) => (
          <article key={title} className="home-feature-card">
            <span className="feature-icon">
              <Icon size={20} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="home-cta">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__dot" /> Ready to trade
          </p>
          <h2>Sẵn sàng vào hệ thống?</h2>
        </div>
        <Link to="/login" className="public-button public-button--gold public-button--large">
          Đăng nhập ngay <ArrowRight size={18} />
        </Link>
      </section>
    </main>
  );
}
