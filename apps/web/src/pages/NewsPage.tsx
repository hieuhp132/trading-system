import { ArrowUpRight, Clock3, Filter } from "lucide-react";
import { Link } from "react-router-dom";

const stories = [
  {
    category: "Gold",
    title: "Vàng giữ nhịp tăng khi thị trường chờ tín hiệu mới từ lãi suất",
    excerpt:
      "Dòng tiền phòng thủ tiếp tục tìm đến kim loại quý trong lúc nhà đầu tư đánh giá lại đường đi của chính sách tiền tệ.",
    time: "12 phút trước",
    accent: "gold",
  },
  {
    category: "Macro",
    title: "Dollar index và lợi suất đang nói gì về phiên giao dịch hôm nay?",
    excerpt:
      "Hai biến số vĩ mô quan trọng đang tạo ra một bức tranh phân hóa cho các tài sản định giá bằng USD.",
    time: "38 phút trước",
    accent: "blue",
  },
  {
    category: "Playbook",
    title: "Ba điều cần kiểm tra trước khi mở một vị thế XAU/USD",
    excerpt:
      "Một checklist ngắn để biến dữ liệu realtime thành quyết định có kỷ luật hơn.",
    time: "1 giờ trước",
    accent: "green",
  },
  {
    category: "Market view",
    title: "Thanh khoản trở lại: phiên Mỹ có thể làm thay đổi cấu trúc giá",
    excerpt:
      "Các vùng giá quan trọng đang hình thành lại khi volume dịch chuyển giữa các phiên.",
    time: "2 giờ trước",
    accent: "violet",
  },
];

export function NewsPage() {
  return (
    <main className="news-page">
      <section className="news-hero">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__dot" /> Market intelligence
          </p>
          <h1>
            Tin tức để bạn
            <br />
            <em>đọc được chuyển động.</em>
          </h1>
          <p>
            Những câu chuyện vĩ mô, góc nhìn thị trường và playbook được chọn
            lọc cho trader demo.
          </p>
        </div>
        <div className="news-hero__orb">
          <span>
            LIVE
            <br />
            <strong>24/7</strong>
          </span>
        </div>
      </section>
      <section className="news-content">
        <div className="news-toolbar">
          <div className="news-filters">
            <button className="news-filter news-filter--active">Tất cả</button>
            <button className="news-filter">Gold</button>
            <button className="news-filter">Macro</button>
            <button className="news-filter">Playbook</button>
          </div>
          <button className="news-sort">
            <Filter size={15} /> Mới nhất
          </button>
        </div>
        <div className="news-grid">
          {stories.map((story, index) => (
            <article
              className={`news-card news-card--${story.accent}${index === 0 ? " news-card--featured" : ""}`}
              key={story.title}
            >
              <div className="news-card__visual">
                <span>{story.category}</span>
                <div className="news-card__wave" />
              </div>
              <div className="news-card__body">
                <div className="news-card__meta">
                  <span>{story.category}</span>
                  <span>
                    <Clock3 size={13} /> {story.time}
                  </span>
                </div>
                <h2>{story.title}</h2>
                <p>{story.excerpt}</p>
                <Link to="/login" className="text-link">
                  Đọc tiếp <ArrowUpRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="news-bottom">
        <div>
          <p className="eyebrow">Không bỏ lỡ nhịp chính</p>
          <h2>
            Đăng nhập để xem market
            <br />
            <em>và đặt lệnh từ cùng một nơi.</em>
          </h2>
        </div>
        <Link to="/login" className="public-button public-button--gold">
          Mở workspace <ArrowUpRight size={16} />
        </Link>
      </section>
    </main>
  );
}
