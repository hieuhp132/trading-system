# HỒ SƠ BÀN GIAO HỆ THỐNG GOLD TRADING

**Phiên bản:** 1.2  
**Ngày lập:** 26/09/2026  
**Phạm vi:** MVP / Paper Trading hiện tại  
**Tổng chi phí bàn giao đề xuất:** **4.200 USD**

---

## 1. Tóm tắt ngắn gọn

Hệ thống Gold Trading hiện tại là một nền tảng giao dịch mô phỏng trên web/PWA, giúp người dùng:

- Theo dõi giá vàng XAU/USD theo thời gian thực.
- Xem biểu đồ giá theo nhiều khung thời gian.
- Mở tài khoản demo và đăng nhập.
- Mua, bán và đóng lệnh.
- Theo dõi số dư, lãi lỗ, rủi ro và margin.
- Quản lý cắt lỗ và chốt lời.
- Sử dụng trên điện thoại và máy tính.

Hệ thống đang ở mức **paper trading/demo trading**, chưa phải hệ thống giao dịch tiền thật hay tích hợp broker thực tế.

---

## 2. Những gì đã hoàn thành

- Giao diện web và PWA cơ bản.
- Trang chủ, đăng nhập, tài khoản demo.
- Dữ liệu giá thời gian thực.
- Biểu đồ giá và lịch sử giá.
- Mở lệnh mua / bán.
- Đóng lệnh và đóng một phần vị thế.
- Theo dõi lợi nhuận và rủi ro.
- Tự động xử lý cắt lỗ / chốt lời khi cần.
- Hệ thống quản lý tài khoản và vị thế cơ bản.

---

## 3. Phạm vi hiện tại

### Đã hoàn thành

- Giao dịch mô phỏng trên tài khoản demo.
- Theo dõi giá và biểu đồ.
- Quản lý vị thế và lịch sử giao dịch.
- Xử lý rủi ro cơ bản trong môi trường demo.
- Giao diện thân thiện với điện thoại.

### Chưa thuộc phạm vi hiện tại

- Giao dịch bằng tiền thật.
- Tích hợp broker thật.
- KYC / AML.
- Nạp và rút tiền.
- Cổng thanh toán.
- Quản trị hệ thống đầy đủ.
- Compliance và pháp lý tài chính.

---

## 4. Bảng chi phí bàn giao

Đơn vị: USD

| Hạng mục | Chi phí |
|---|---:|
| Nghiên cứu và kiến trúc hệ thống | 350 |
| Hệ thống tài khoản và xác thực | 600 |
| Dữ liệu giá và thời gian thực | 750 |
| Giao dịch và quản lý rủi ro | 900 |
| Công việc quản lý rủi ro và worker | 650 |
| Giao diện web/PWA | 700 |
| Kiểm thử và bàn giao | 250 |
| **Tổng cộng** | **4.200** |

### Điều kiện chi phí

Mức **4.200 USD** là chi phí trọn gói cho phạm vi **MVP / Paper Trading** hiện tại.

Không bao gồm:

- Phí dữ liệu giá từ bên thứ ba.
- Chi phí máy chủ, hosting, domain, SSL.
- Broker, thanh toán, KYC, compliance.
- Yêu cầu mới ngoài phạm vi hiện tại.

> Nếu khách hàng muốn giữ ở mức 4.000 USD, cần ghi rõ đây là gói giới hạn trong phạm vi demo trading, không bao gồm sản phẩm giao dịch thật, monitoring, compliance và hỗ trợ mở rộng.

---

## 5. Lộ trình tiếp theo cho khách hàng

### Giai đoạn 1: Hoàn thiện hệ thống cơ bản
**Mục tiêu:** nâng cấp độ ổn định và trải nghiệm sử dụng.

- Tối ưu dữ liệu giá và kiểm soát chi phí API.
- Sửa lỗi và cải thiện trải nghiệm giao dịch.
- Kiểm tra hiệu năng cho khoảng 50–100 người dùng cùng lúc.
- Hoàn thiện kiểm thử và QA.

**Ước tính:** 2–4 tuần, **1.000–1.800 USD**.

### Giai đoạn 2: Tăng quy mô và vận hành tốt hơn
**Mục tiêu:** hệ thống sẵn sàng phục vụ nhiều người dùng hơn.

- Cache dữ liệu, tối ưu hiệu năng.
- Giảm số lần gọi API và tiết kiệm chi phí.
- Theo dõi hệ thống và ghi log tốt hơn.
- Cài đặt bảo mật và giới hạn truy cập.
- Triển khai môi trường staging/production.

**Ước tính:** 2–4 tuần, **1.200–2.000 USD**.

### Giai đoạn 3: Mở rộng theo mô hình fintech thực tế
**Mục tiêu:** chuẩn bị cho sản phẩm có thể vận hành như một nền tảng tài chính thật.

- Quản trị hệ thống và nhật ký hoạt động.
- KYC và quản lý tài khoản người dùng.
- Nạp/rút tiền và cổng thanh toán.
- Backup, kiểm soát compliance và pháp lý.

**Ước tính:** 3–6 tuần, **2.000–4.000 USD**.

### 5.1. Cập nhật giao diện dashboard và trải nghiệm người dùng gần nhất
**Thời điểm:** 29/09/2026

Trong giai đoạn cập nhật gần đây, nhóm phát triển đã tập trung vào việc làm cho dashboard tổng quan rõ ràng hơn, gọn hơn và phù hợp hơn với việc sử dụng trên mobile.

- Bỏ các badge “Demo” lặp lại ở góc trên cùng để giao diện sạch hơn và tập trung vào dữ liệu tài khoản thực tế.
- Giữ lại phần Overview với chỉ số tài khoản chính rõ ràng: equity, balance, unrealized P&L, used margin, free margin, margin level.
- Chỉ giữ một biểu đồ Account equity trong overview, thay vì hiển thị nhiều chart cùng lúc, nhằm giảm nhiễu và tăng khả năng theo dõi.
- Đồng bộ bộ lọc thời gian của chart equity theo mô hình XAUUSD: 1m, 5m, 15m, 1h, 4h, 1d, 1M, 3M, 6M, 1y, All. Option All luôn đặt ở cuối theo cách tương đồng với chart thị trường.
- Khi người dùng click vào một phạm vi thời gian, biểu đồ sẽ lọc đúng theo khoảng thời gian được lựa chọn và giữ trạng thái khớp với nút active.
- Tối ưu giao diện mobile: layout chuyển từ dạng nhiều cột sang dạng 1 cột trên màn hình nhỏ, khoảng cách và nút điều hướng được điều chỉnh để thao tác dễ hơn bằng tay.
- Duy trì phần market snapshot và badge trạng thái thị trường ở vùng dưới cùng để người dùng vẫn quan sát được giá XAUUSD và tình trạng dữ liệu trong cùng không gian.

Kết luận ngắn gọn: các bản cập nhật này không thay đổi mục tiêu kinh doanh của sản phẩm, nhưng giúp dashboard trở nên tối giản hơn, dễ đọc hơn và phù hợp hơn với mô hình sử dụng chủ yếu là thiết bị di động.

### 5.2. Cách cập nhật dữ liệu XAUUSD Chart và kiểm soát API credits

Chart lấy dữ liệu qua backend của hệ thống. Backend nhận giá tham chiếu XAUUSD từ Twelve Data, lưu lịch sử vào database và cập nhật các nến theo khung 1m, 5m, 15m, 1h, 4h và 1d. Khi người dùng mở chart hoặc đổi khung thời gian, frontend đọc dữ liệu nến đã lưu/cache từ backend; mỗi lần tải chart không đồng nghĩa với một lần gọi Twelve Data.

- Backend có cache giá khoảng 60 giây ở tầng Twelve Data provider theo cấu hình mặc định. Vì vậy luồng xử lý nội bộ có thể chạy thường xuyên hơn, nhưng không tạo một API request mới cho mỗi lần chạy.
- Nến lịch sử được đọc từ database. Nến mới được cập nhật từ các quote giá nhận được; endpoint chart hiện tại không gọi Twelve Data time-series cho mỗi lần frontend làm mới.
- Frontend kiểm tra lại dữ liệu chart theo chu kỳ tùy timeframe (từ 15 giây đến 60 phút). Đây là request tới backend; cache và database giúp hạn chế việc các request này chuyển thành request mới tới nhà cung cấp.
- Khi thị trường đóng cửa hoặc nguồn giá gặp lỗi/hết hạn mức, hệ thống có thể tạm dùng dữ liệu đã lưu. Vì vậy thời điểm hiển thị trên chart có thể trễ so với thị trường; đây không phải luồng tick-by-tick được bảo đảm.

**API credits và chi phí:** ứng dụng có bộ đếm nội bộ, mặc định dự trù 1 credit mỗi phút và giới hạn 10 credit mỗi ngày nếu môi trường triển khai không ghi đè cấu hình. Đây là hàng rào bảo vệ do ứng dụng đặt ra, không phải hạn mức gói dịch vụ hay hóa đơn chính thức của Twelve Data. Gói Twelve Data thực tế có thể tính credits theo quy tắc riêng; cần đối chiếu dashboard và điều khoản của tài khoản đang sử dụng trước khi cam kết chi phí.

**Đánh giá:** thiết kế hiện tại đã giảm request lặp nhờ cache, database và tái sử dụng nến; do đó hợp lý cho MVP và có ý thức kiểm soát chi phí. Chưa đủ căn cứ để khẳng định đây là phương án rẻ nhất: cần đo số request/credits thực tế trong giờ thị trường hoạt động, xác nhận cách Twelve Data tính credits cho gói đang dùng, rồi mới so sánh được các chu kỳ cập nhật hoặc nhà cung cấp khác. Với hệ thống nhiều backend instance, nên bổ sung cache/phân phối quote dùng chung để tránh mỗi instance tự gọi nguồn giá.

---

## 6. Kết luận

Hệ thống Gold Trading hiện tại đã đạt đúng hướng của một nền tảng giao dịch demo hiện đại, với các chức năng cốt lõi đã được xây dựng và kiểm thử. Đây là nền tảng đủ mạnh để tiếp tục phát triển thành sản phẩm thực tế trong tương lai.

Với mục tiêu tối ưu thời gian và chi phí, mức **4.200 USD** là mức hợp lý để bàn giao hiện tại. Nếu khách hàng muốn mở rộng lên mô hình tài chính thật, cần triển khai theo từng giai đoạn riêng biệt.
