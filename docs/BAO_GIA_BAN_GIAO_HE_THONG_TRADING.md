# BÁO GIÁ BÀN GIAO HỆ THỐNG GOLD TRADING

**Ngày:** 25/09/2026  
**Gói:** MVP/Paper Trading  
**Tổng giá trị:** **4.200 USD**

## Phạm vi cung cấp

| STT | Hạng mục | Giá trị |
|---:|---|---:|
| 1 | Khảo sát, phân tích và kiến trúc | 350 USD |
| 2 | Backend API, authentication và demo account | 600 USD |
| 3 | Market data, candles, realtime stream và provider integration | 750 USD |
| 4 | Trading engine, order/position/trade lifecycle | 900 USD |
| 5 | Margin risk, Stop-Out và background workers | 650 USD |
| 6 | Frontend, responsive UI, PWA và public pages | 700 USD |
| 7 | Kiểm thử, tài liệu kỹ thuật và bàn giao | 250 USD |
|  | **Tổng cộng** | **4.200 USD** |

## Sản phẩm bàn giao

- Source code monorepo.
- Backend API TypeScript/Express.
- Frontend React/Vite/PWA.
- PostgreSQL/Prisma schema và migrations.
- Demo trading flow cho XAU/USD.
- Market provider abstraction và Twelve Data integration.
- Margin/Stop-Out protection.
- Regression/E2E test scripts.
- Hồ sơ kỹ thuật và hướng dẫn chạy hệ thống.

## Điều kiện và loại trừ

Giá trên áp dụng cho phạm vi MVP/Paper Trading hiện tại. Không bao gồm:

- Phí Twelve Data hoặc bên cung cấp market data.
- Server/cloud/database/domain/SSL/monitoring.
- Broker execution và giao dịch tiền thật.
- KYC, AML, payment gateway, nạp/rút tiền.
- Tư vấn pháp lý hoặc giấy phép tài chính.
- Admin production đầy đủ.
- Tính năng mới hoặc thay đổi yêu cầu sau nghiệm thu phạm vi này.

## Ghi chú nghiệm thu

Hệ thống được nghiệm thu theo các luồng:

- Đăng ký, đăng nhập và tạo demo account.
- Lấy market price và candle chart.
- Mở BUY/SELL.
- Đóng toàn bộ và đóng một phần vị thế.
- Cập nhật balance, equity và P&L.
- Stop-Out tự động khi account risk đạt ngưỡng.
- Không tạo duplicate khi có thao tác đóng đồng thời.
- Hoạt động trên desktop browser và mobile/PWA shell.
