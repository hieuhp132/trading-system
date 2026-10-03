# REVIEW CHI PHÍ 4.000 USD SO VỚI HỆ THỐNG HIỆN TẠI

**Ngày review:** 25/09/2026  
**Phạm vi đối chiếu:** Gold Trading MVP / Paper Trading hiện tại  
**Kết luận ngắn:** **Match ở mức MVP thương mại, nhưng thấp hơn khoảng 200 USD nếu tính toàn bộ phạm vi đã phát triển.**

## 1. Kết luận điều hành

Bảng chi phí 4.000 USD của khách hàng **không sai về cấu trúc** và bao phủ đúng các nhóm chính của hệ thống:

- Kiến trúc/database.
- Frontend responsive.
- Authentication/demo account.
- Market data/chart.
- Order execution.
- Position, balance và P&L.
- Dashboard/history.
- QA/deployment.
- Tài liệu/bàn giao.

Tuy nhiên, hệ thống hiện tại đã phát triển vượt một MVP giao diện + order flow cơ bản ở một số phần:

- Market provider abstraction và Twelve Data integration.
- SSE reference quote stream.
- Quote freshness và execution guard.
- Margin Call, Stop-Out và forced liquidation.
- Account locking và concurrency protection.
- Partial close và duplicate-close protection.
- Nhiều timeframe chart: 1m, 5m, 15m, 1h, 4h, 1d, 1y.
- Landing page, news page, PWA manifest/service worker.
- Bộ regression/E2E test và tài liệu bàn giao Excel/Markdown.

Vì vậy:

- **4.000 USD:** phù hợp nếu bàn giao dưới tên “MVP/Paper Trading package”, giới hạn rõ production deployment và các chi phí hạ tầng.
- **4.200 USD:** phù hợp hơn với phạm vi thực tế đã triển khai và là mức nên dùng khi báo giá/bàn giao chính thức.
- **Trên 4.200 USD:** chỉ nên áp dụng nếu bao gồm deployment production, monitoring, cloud setup, security hardening hoặc support sau bàn giao.

## 2. Đối chiếu từng hạng mục

| Hạng mục khách hàng | Chi phí đề xuất | Đánh giá | Nhận xét |
|---|---:|---|---|
| Phân tích yêu cầu, kiến trúc và database | 300 USD | Gần match, hơi thấp | Có monorepo, module boundaries, PostgreSQL/Prisma, transaction và lock account. Mức hợp lý hơn: 350 USD. |
| Frontend foundation và giao diện responsive | 500 USD | Thấp | Không chỉ có foundation; hiện có dashboard, market terminal, login redesign, landing, news, PWA, mobile navigation, shared icons. |
| Authentication và Demo Account | 300 USD | Match | Có register/login JWT, auth middleware, persistent frontend state và bootstrap demo account. |
| Market Data và Price Chart | 450 USD | Thấp rõ rệt | Có provider abstraction, demo/Twelve Data, SSE, candles, quote validation, budget guard và 7 timeframe. |
| Order Management và Simulated Execution | 850 USD | Gần match | Có BUY/SELL, weighted average, atomic order/position/trade, close và partial close. Mức này chấp nhận được cho paper trading. |
| Position Management, Balance và P&L | 700 USD | Match | Có position lifecycle, realized/unrealized P&L, balance/equity, margin metrics và stop-level support. |
| Dashboard và Trade History | 250 USD | Match | Có overview dashboard, positions, orders/trades history và market snapshot. |
| QA, sửa lỗi và Deployment | 400 USD | Match có điều kiện | QA/regression đã làm đáng kể. Tuy nhiên chưa nên gọi là production deployment nếu chưa bao gồm cloud, monitoring, backup và SSL/domain. |
| Tài liệu và bàn giao source code | 250 USD | Match | Đã có hồ sơ kỹ thuật, báo giá, README bàn giao và workbook Excel. |

## 3. Những phần làm chi phí thực tế tăng so với bảng 4.000 USD

### 3.1. Market data không còn là phần chart cơ bản

Hệ thống có:

- `MarketDataProvider` abstraction.
- Demo provider.
- Twelve Data provider.
- Bid/Ask và source metadata.
- Quote freshness validation.
- Execution boundary/fail-closed guard.
- SSE reference quote stream.
- Twelve Data budget state và quota handling.
- Candle interval 1m, 5m, 15m, 1h, 4h, 1d, 1y.

Đây là phần có độ phức tạp cao hơn một chart tĩnh hoặc một REST price endpoint đơn giản.

### 3.2. Trading engine có transaction/concurrency safety

Backend không chỉ tạo order đơn giản. Hệ thống có:

- Account row locking.
- Transactional state transition.
- Partial close.
- Không tạo duplicate order/trade khi double-close.
- Re-check position sau lock.
- Weighted average entry price.
- Balance/equity recalculation.

Đây là lý do order engine và position engine cần được tính là nghiệp vụ trading thực sự, dù vẫn là simulated execution.

### 3.3. Risk protection là một lớp đáng kể

Đã có:

- NORMAL, MARGIN_CALL, STOP_OUT.
- Negative equity/balance handling.
- Stop-Out worker.
- Loss ranking policy.
- Forced close.
- Re-evaluation dưới account lock.
- Regression cho recovered account và duplicate execution.

Phần này không nên bị xem là một vài dòng validation trong order API.

### 3.4. Frontend đã vượt phạm vi foundation

Ngoài dashboard trading, hiện có:

- Public landing.
- Public news.
- Login experience redesign.
- Market terminal redesign.
- Responsive desktop/mobile navigation.
- Shared Gold Trading brand mark.
- PWA manifest và service worker.
- Add to Home Screen metadata.
- Developing-state cho khu vực chưa hoàn thiện.

## 4. Đề xuất điều chỉnh thương mại

### Phương án A: Giữ giá 4.000 USD

Có thể giữ nếu ghi rõ phạm vi:

> Gói MVP/Paper Trading, bàn giao source code và môi trường development/test; không bao gồm production cloud deployment, monitoring, backup, domain/SSL, phí market data, broker, KYC/AML và các tính năng phát sinh.

Trong phương án này, mục “QA, sửa lỗi và Deployment” nên đổi thành:

> QA, sửa lỗi và hướng dẫn triển khai development/staging.

### Phương án B: Dùng mức 4.200 USD, khuyến nghị

Mức 4.200 USD phản ánh hợp lý hơn phần đã phát triển thêm mà không làm thay đổi cấu trúc báo giá và phù hợp với scope hệ thống hiện thực tế. Đây là mức nên dùng khi bàn giao theo trạng thái hiện tại của repo, vì hệ thống đã có trading engine, risk engine, workers, marketplace abstraction, cache/quota guard và frontend PWA tương đối hoàn chỉnh. Có thể phân bổ như sau:

| Hạng mục | Chi phí |
|---|---:|
| Phân tích yêu cầu, kiến trúc và database | 350 USD |
| Frontend foundation và giao diện responsive | 550 USD |
| Authentication và Demo Account | 300 USD |
| Market Data và Price Chart | 650 USD |
| Order Management và Simulated Execution | 850 USD |
| Position Management, Balance và P&L | 700 USD |
| Dashboard và Trade History | 250 USD |
| QA, sửa lỗi và Deployment development/staging | 300 USD |
| Tài liệu và bàn giao source code | 250 USD |
| **Tổng cộng** | **4.200 USD** |

### Phương án C: Báo giá production

Không nên gộp production deployment vào 4.000–4.200 USD. Cần báo giá riêng cho:

- Cloud/server setup.
- Managed PostgreSQL.
- Domain, SSL, email.
- Monitoring, alerting, log aggregation.
- Backup/restore và disaster recovery.
- Security review, rate limit và secret management.
- Load test.
- Broker/real trading integration.
- Compliance/KYC/AML.

## 5. Những gì chưa nên tuyên bố với khách hàng

Không nên mô tả hệ thống hiện tại là:

- Hệ thống giao dịch tiền thật đã sẵn sàng production.
- Đã có broker execution production.
- Đã có KYC/AML hoặc legal compliance.
- Đã có SLA vận hành 24/7.
- Đã bao gồm cloud deployment và monitoring production.
- Market data Twelve Data là nguồn execution-grade đầy đủ bid/ask thật trong mọi tình huống.

Nên mô tả chính xác là:

> Nền tảng MVP/Paper Trading cho XAU/USD, có market data integration, realtime reference quote, simulated execution, margin risk và Stop-Out protection ở backend.

## 6. Kết luận cuối

**Bảng 4.000 USD match khoảng 90–95% với phạm vi MVP**, nhưng thiếu định giá cho các phần mở rộng đã được triển khai trong market data, risk protection, concurrency safety, PWA và public frontend.

Khuyến nghị dùng **4.200 USD** cho bộ bàn giao hiện tại. Nếu bắt buộc giữ **4.000 USD**, cần giữ nguyên giá nhưng thu hẹp cam kết bằng cách loại trừ production deployment và ghi rõ đây là gói MVP/Paper Trading, không bao gồm hạ tầng, provider fees, broker, compliance và support mở rộng.
