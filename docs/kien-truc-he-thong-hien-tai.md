# Kiến trúc hệ thống hiện tại

## 1. Tổng quan

Dự án hiện nay là một monorepo theo mô hình multi-app với 2 ứng dụng chính:

- `apps/api`: backend trading engine, API REST, layer nghiệp vụ, worker xử lý stop/limit/stop-out
- `apps/web`: frontend giao diện demo trading, dashboard, market, order entry, positions, history
- `packages/*`: các package dùng chung cho cấu hình hoặc kiểu dữ liệu

Cấu trúc hiện tại cho thấy đây là một trading system MVP theo hướng demo paper trading, tập trung vào giao dịch XAUUSD (vàng) với logic kiểm soát margin, position, order, stop loss, take profit và market reference quote.

---

## 2. Kiến trúc tổng thể

### 2.1. Monorepo + package manager

- Workspace sử dụng `pnpm` và file `pnpm-workspace.yaml`
- Root package hiện có script:
  - `dev:web`
  - `dev:api`
  - `build`
  - `lint`
  - `typecheck`

Điểm này cho thấy dự án đang xây theo hướng nhiều app nhưng vẫn dùng chung tooling và dòng phát triển tập trung ở root.

### 2.2. API layer

Backend chạy trên Node.js + TypeScript + Express.

Primary entry:
- `apps/api/src/main.ts`
- `apps/api/src/app.ts`

#### Mô hình bootstrap backend

`main.ts` làm các công việc sau:

1. Load `.env`
2. Khởi tạo Express app
3. Khởi tạo market reference quote feed
4. Khởi tạo background workers:
   - stop worker
   - limit worker
   - stop-out worker
5. Start server trên port 4000 mặc định
6. Register graceful shutdown với `SIGINT` / `SIGTERM`

Điểm quan trọng: API không chỉ phục vụ HTTP mà còn chạy các background jobs để giám sát lệnh và chốt điều kiện market-triggered events.

### 2.3. Cấu trúc HTTP API

App router chính trong `apps/api/src/app.ts`:

- `/api/v1/health`
- `/api/v1/auth`
- `/api/v1/accounts`
- `/api/v1/market`
- `/api/v1/orders`

Các route được phân theo module: `auth`, `accounts`, `market`, `orders`, cùng với các module phụ như `positions`, `trades`, `users`.

Giao thức API được tổ chức theo kiểu:

- `route.ts` định nghĩa endpoint
- `controller.ts` xử lý request/response
- `service.ts` chứa nghiệp vụ chính
- `schema.ts` chứa validation input/output
- `types.ts` chứa type nâng cao

Đây là mô hình khá chuẩn của một backend enterprise MVP.

---

## 3. Data layer

### 3.1. Database

Dùng PostgreSQL qua Prisma.

- File Prisma schema: `apps/api/prisma/schema.prisma`
- Database URL từ biến môi trường `DATABASE_URL`
- `docker-compose.yml` chỉ chạy container PostgreSQL

Các model chính:

- `User`
- `DemoAccount`
- `MarketPrice`
- `Order`
- `Position`
- `Trade`

#### Domain model

- `User` đại diện người dùng
- `DemoAccount` đại diện tài khoản demo, có `balance`, `equity`, `status`
- `Order` lưu trật tự lệnh và trạng thái
- `Position` lưu vị thế đang mở
- `Trade` lưu giao dịch thực thi và P&L
- `MarketPrice` lưu dữ liệu giá từ market feed

Schema đang khá rõ về tài khoản demo và logic paper trading.

### 3.2. Prisma runtime

File `apps/api/src/database/prisma.ts` dùng Prisma contract model với `@prisma/orm-postgres/runtime`. Đây là một cách dùng lạ hơn so với Prisma client thông thường, nhưng cho thấy dự án đang hướng tới `Prisma contract` và `typed query` layer, rất mới và có tính thử nghiệm cao.

Đây là một điểm cần review kỹ vì:

- nó tăng độ phức tạp của system
- có thể tạo rủi ro về compatibility và maintainability nếu không hết khâu thử nghiệm
- API layer đã dùng `db.transaction` và raw SQL cho lock account, cho thấy cần kỷ luật dữ liệu cao

---

## 4. Nền tảng nghiệp vụ chính

### 4.1. Market data và reference quote

Module market nằm ở `apps/api/src/modules/market`.

Cấu thành:

- `service.ts` — orchestrator cho market data
- `providers/` — provider implementation
- `reference-quote-feed.ts` — feed cập nhật quote liên tục
- `reference-quote-cache.ts` — cache giá tham chiếu
- `quote-adapter.ts` — chuyển đổi dữ liệu provider về quote chuẩn
- `trading-quote.ts` — validate bid/ask/timestamp

#### Mục tiêu kiến trúc

Hệ thống tách biệt giữa:

- `market price` dùng để hiển thị
- `reference quote` dùng để xác minh và kiểm soát tín hiệu
- `trading quote` dùng để thực thi lệnh

Điều này là một mô hình khá tốt, vì nó phân tách rõ "giá hiển thị" và "giá giao dịch được phép thực thi".

#### Provider model

`createMarketDataProvider()` hỗ trợ:

- `demo`
- `twelve-data`

Với logic:

- nếu provider là `TwelveDataProvider`, trading execution bị fail-closed và không cho ra lệnh nếu chưa xác minh nguồn giá
- `DemoMarketDataProvider` là provider mặc định cho môi trường phát triển/demo

Đây là một thiết kế an toàn và đúng tư duy trading system.

### 4.2. Order/position engine

Module `orders` là trọng tâm của hệ thống.

File chính:

- `route.ts`
- `controller.ts`
- `service.ts`
- `schema.ts`
- `types.ts`
- `margin-risk.ts`
- `stop-levels.ts`
- `stop-trigger.ts`
- `limit-trigger.ts`
- `stop-worker.ts`
- `limit-worker.ts`
- `stop-out-worker.ts`

#### Nền tảng logic

- `validateOrderVolume()` kiểm tra khối lượng hợp lệ cho XAUUSD
- `calculateRequiredMargin()` tính margin bắt buộc
- `calculateAccountMarginRisk()` đánh giá mức rủi ro account
- `assertTradingExecutionAllowed()` gate việc cho phép thực thi lệnh
- `getTradingQuote()` lấy giá khớp với quy tắc verification

#### Quá trình giao dịch

- nhận order request
- validate symbol, quantity, side, type
- xác định giá thực thi dựa trên bid/ask
- lock account row để tránh race condition
- tạo order / position / trade
- cập nhật balance, margin, P&L

Về mặt kiến trúc, đây là một hệ thống order engine với xử lý nghiệp vụ khá đầy đủ.

### 4.3. Worker xử lý điều kiện trigger

Background workers là phần quan trọng nhất trong system hiện tại.

#### `stop-worker`
Xử lý stop loss / take profit khi giá chạm ngưỡng.

#### `limit-worker`
Xử lý các order có điều kiện hoặc limit order (nếu có hỗ trợ).

#### `stop-out-worker`
Xử lý tình trạng account bị stop-out theo mức margin.

#### Mô hình hoạt động

- worker start trong `main.ts`
- mỗi worker có `intervalMs` và `maxQuoteAgeMs`
- worker chạy lặp, đánh giá trigger, điều kiện order/position và update DB

Đây là trường hợp tốt cho một trading system theo pattern event-driven polling worker với cooldown, risk checks và quote freshness validation.

---

## 5. Bảo mật và xác thực

### 5.1. JWT auth

- `apps/api/src/modules/auth/route.ts`
- `apps/api/src/modules/auth/middleware.ts`

Flow:

- login/register với validation schema
- `requireAuth` kiểm tra `Authorization: Bearer <token>`
- verify token bằng `verifyAccessToken`
- gắn `req.res.locals.auth` hoặc `res.locals.auth`

Đây là auth model rất đơn giản và đủ cho paper trading MVP.

### 5.2. Middleware và exception handling

- `common/errors/error-handler.ts`
- `common/middleware/not-found-handler.ts`
- `common/utils/async-handler.ts`

Mẫu dùng chung cho xử lý lỗi rất rõ, giúp route không bị lỗi bất đồng bộ rò rỉ.

---

## 6. Frontend architecture

### 6.1. React + Vite

Frontend chạy trên React 19 + Vite + TypeScript.

- `main.tsx` bootstrap app
- `app/AppProviders.tsx` gói `QueryClientProvider` và `MarketStreamBridge`
- `app/router.tsx` định nghĩa route auth/protected

### 6.2. State management

- Zustand dùng cho auth store: `stores/auth.ts`
- React Query dùng cho data fetching và caching: account, market, order state

### 6.3. UI structure

Các folder chính:

- `app/`
- `components/`
- `features/`
- `layouts/`
- `pages/`
- `stores/`
- `types/`

#### Important UI blocks

- `DashboardPage`: overview balance, equity, P&L
- `MarketPage`: chart và data price
- `TradePage`: đặt lệnh
- `PositionsPage`: theo dõi vị thế
- `HistoryPage`: lịch sử lệnh

### 6.4. Real-time market bridge

`features/market/MarketStreamBridge` kết nối trạng thái market stream và freshness status.

Điều này cho thấy UI đã coi trọng real-time flow, không đơn thuần fetch API từng lần.

---

## 7. Kiến trúc request flow

### 7.1. Flow đặt lệnh

1. user login và nhận JWT
2. browser gọi `/api/v1/orders` với token
3. API validate input
4. API lấy `getTradingQuote()`
5. xứ lý risk + margin
6. lock account row trong DB
7. tạo `Order`, `Position`, `Trade`
8. trả về execution result
9. UI render lại balance / positions / history

### 7.2. Flow market price

1. provider lấy giá từ source
2. quote được adapt vào reference format
3. cache lưu quote
4. worker đánh giá stop/limit/stop-out trigger
5. frontend query price và status freshness

---

## 8. Điểm mạnh của kiến trúc hiện tại

1. Tách biệt rõ các layer: route, controller, service, data, workers.
2. Có mô hình `MarketQuote` rõ ràng, rất phù hợp cho hệ thống giao dịch.
3. Có background workers cho logic real-time, không chỉ API đơn thuần.
4. Có fail-closed logic để tránh trading với quote chưa xác minh.
5. Có dữ liệu và state rõ ràng cho account/position/order/trade.
6. Có separation giữa auth UI, protected route và public route.

---

## 9. Điểm cần review / rủi ro hiện tại

### 9.1. Mức độ đã hoàn thiện còn không đồng đều

- Backend đang khá mạnh về logic nghiệp vụ
- Frontend đang có vẻ là shell UI hơn là app hoàn chỉnh
- Một số file như `apps/web/src/App.tsx` hiện chỉ `return null`, cho thấy frontend chưa được final hoàn thiện hoặc đang trong quá trình migration.

### 9.2. Triển khai schema/contract có dấu hiệu đang trong transition

- Prisma schema cho `OrderType` chỉ hỗ trợ `MARKET`
- Nhưng trong `orders/service.ts` và code khác có logic để xử lý `limit`, `stop` và `partial close`
- Điều này cho thấy dự án đang phát triển theo hướng nhiều tính năng, nhưng schema/model chưa đồng bộ hoàn toàn với code.

### 9.3. Có nhiều worker nhưng chưa rõ ownership

- Worker bắt đầu trong `main.ts`
- Nhưng logic thực thi nằm rải rác trong các module worker + service
- Nếu không có tên gọi rõ, dễ mất kiểm soát khi hệ thống lớn dần.

### 9.4. Risk/market validation đang ở mức khá mạnh nhưng cần centralization

- Cần chuẩn hóa: who owns validation? order service, market service, or workers?
- Hiện tại logic vừa nằm ở service vừa nằm ở worker, cần thống nhất để dễ test.

### 9.5. Database locking và transaction safety cần được xem lại

- Dùng `FOR UPDATE` tự tay ở `lockDemoAccount()` là dấu hiệu tốt, nhưng cần kiểm tra mọi path update account/position/trade để đảm bảo toàn vẹn ledger.

---

## 10. Kết luận

Kiến trúc hiện tại của dự án đang ở dạng một trading system MVP khá mạnh về logic backend và market risk control, nhưng vẫn còn là phiên bản đang phát triển nhiều tính năng. Nếu đặt trong góc nhìn engineering, kiến trúc hiện nay đang đi đúng hướng về mặt separation of concerns và risk-aware trading engine.

Tuy nhiên, các điểm cần lưu ý là:

- đồng bộ schema-model với requirement thật
- hoàn thiện frontend shell và state management
- chuẩn hóa ownership của worker và validation
- kiểm tra consistence giữa API response/UI models

Về mặt tổng thể, đây là một kiến trúc đáng triển khai và có tiềm năng đi xa nếu tiếp tục gọn gàng hóa boundary giữa business logic và operational workers.

---

## 11. Đánh giá nhanh

Nếu đánh giá theo thang 10:

- Backend architecture: 8.5/10
- Frontend architecture: 7/10
- Risk control & order engine: 8.5/10
- Production readiness: 6.5/10
- Maintainability: 7.5/10

Nói ngắn gọn: backend đã có hình thái một hệ thống giao dịch thực thụ, frontend đang ở mức app dashboard + trading shell, chưa hoàn toàn đóng khung để go-live.
