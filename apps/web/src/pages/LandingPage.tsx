import {
  ArrowRight,
  BarChart3,
  BellRing,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { MarketAurora } from "../components/MarketAurora";

const marketCards = [
  {
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    value: "4,280.56",
    change: "+1.84%",
    positive: true,
  },
  {
    symbol: "BTCUSD",
    name: "Bitcoin / US Dollar",
    value: "113,842.00",
    change: "+0.72%",
    positive: true,
  },
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    value: "1.1742",
    change: "-0.16%",
    positive: false,
  },
  {
    symbol: "USDJPY",
    name: "US Dollar / Yen",
    value: "152.74",
    change: "+0.42%",
    positive: true,
  },
  {
    symbol: "DXY",
    name: "US Dollar Index",
    value: "103.18",
    change: "-0.31%",
    positive: false,
  },
  {
    symbol: "NASDAQ",
    name: "Nasdaq 100",
    value: "20,831.44",
    change: "+0.53%",
    positive: true,
  },
];

const featureCards = [
  {
    title: "Realtime by default",
    text: "Giá, chart và trạng thái market được lấy liên tục để bạn phản ứng đúng nhịp.",
    icon: BarChart3,
  },
  {
    title: "Risk trước, lệnh sau",
    text: "Margin, stop-out và execution guard được xử lý ở backend, an toàn hơn cho account demo.",
    icon: ShieldCheck,
  },
  {
    title: "Tin tức có ngữ cảnh",
    text: "Mỗi tin tức được sắp xếp theo thị trường lớn, không làm bạn mất ngữ cảnh.",
    icon: BellRing,
  },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <MarketAurora />
        <div className="landing-hero__glow landing-hero__glow--one" />
        <div className="landing-hero__glow landing-hero__glow--two" />

        <div className="landing-hero__content">
          <p className="eyebrow">
            <span className="eyebrow__dot" /> Live market workspace
          </p>
          <h1>
            Đọc thị trường.
            <br />
            <span>Giao dịch tự tin.</span>
          </h1>
          <p className="landing-hero__lead">
            Một không gian paper trading realtime cho XAU/USD, được xây dựng để
            bạn nhìn thấy chuyển động và hành động đúng lúc, trên mọi màn hình.
          </p>

          <div className="landing-hero__actions">
            <Link to="/login" className="public-button public-button--gold public-button--large">
              Mở tài khoản demo <ArrowRight size={18} />
            </Link>
            <Link to="/news" className="text-link">
              Đọc tin thị trường <ArrowRight size={15} />
            </Link>
          </div>

          <div className="landing-hero__trust">
            <span>
              <ShieldCheck size={15} /> Không rủi ro vốn thật
            </span>
            <span>
              <Sparkles size={15} /> Dữ liệu realtime
            </span>
          </div>
        </div>

        <div className="landing-hero__ticker" aria-label="Market ticker">
          {marketCards.slice(0, 3).map((card) => (
            <div className="ticker-card" key={card.symbol}>
              <span>{card.symbol}</span>
              <strong>{card.value}</strong>
              <small className={card.positive ? "is-positive" : "is-negative"}>{card.change}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="market-strip" aria-labelledby="market-strip-title">
        <div className="public-section__heading">
          <div>
            <p className="eyebrow">Theo dõi nhịp thị trường</p>
            <h2 id="market-strip-title">Những gì đang chuyển động</h2>
          </div>
          <Link to="/login" className="text-link">
            Mở workspace <ArrowRight size={15} />
          </Link>
        </div>

        <div className="market-strip__grid">
          {marketCards.map((card) => (
            <article className="market-card" key={card.symbol}>
              <div className="market-card__top">
                <span className="market-card__symbol">{card.symbol}</span>
                <BarChart3 size={18} />
              </div>
              <p>{card.name}</p>
              <strong>{card.value}</strong>
              <small className={card.positive ? "is-positive" : "is-negative"}>{card.change} hôm nay</small>
              <div className={`market-card__line ${card.positive ? "market-card__line--up" : "market-card__line--down"}`} />
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section" id="how-it-works">
        <div className="feature-section__intro">
          <p className="eyebrow">Một hệ thống rõ ràng</p>
          <h2>
            Tập trung vào điều
            <br />
            <span>thực sự quan trọng.</span>
          </h2>
          <p>
            Không gian gọn, dữ liệu sống và những lớp bảo vệ cần thiết để bạn
            luyện tập như đang ở trong một terminal chuyên nghiệp.
          </p>
        </div>

        <div className="feature-grid">
          {featureCards.map(({ title, text, icon: Icon }) => (
            <article key={title}>
              <span className="feature-icon">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-signal-grid" aria-label="Signal summary cards">
        <article className="landing-signal-card landing-signal-card--accent">
          <p className="eyebrow">Signal overview</p>
          <h3>Phân tích theo nhịp thị trường</h3>
          <p>Giữ lịch sử giá, tín hiệu và mức hỗ trợ kháng cự trong cùng một màn hình.</p>
        </article>
        <article className="landing-signal-card">
          <span>Liquidity</span>
          <strong>High</strong>
          <small>Phiên châu Á và châu Âu đang tăng rõ</small>
        </article>
        <article className="landing-signal-card">
          <span>Momentum</span>
          <strong>Strong</strong>
          <small>Giá vàng vẫn duy trì ưu thế phục hồi</small>
        </article>
        <article className="landing-signal-card">
          <span>Risk mode</span>
          <strong>Balanced</strong>
          <small>Đánh giá vị thế theo nhịp và thanh khoản</small>
        </article>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">Sẵn sàng quan sát?</p>
          <h2>
            Thị trường không chờ đợi.
            <br />
            <span>Workspace của bạn cũng vậy.</span>
          </h2>
        </div>
        <Link to="/login" className="public-button public-button--gold public-button--large">
          Vào hệ thống <ArrowRight size={18} />
        </Link>
      </section>
    </main>
  );
}
