# Phân công 3 người và kịch bản vấn đáp — Mini Cinema

## Thành viên 1 — GIAO DIỆN (Frontend)
**File phụ trách:** `public/index.html`, `public/style.css`, `public/app.js`.

- Thiết kế trang chủ, thẻ phim, ô tìm kiếm, form đăng nhập/đăng ký, trang đặt vé, danh sách vé, trang quản trị.
- Dùng HTML tạo cấu trúc, CSS tạo giao diện responsive; JS dùng `fetch()` gọi API, cập nhật HTML.
- Demo: tìm phim > bấm Đặt vé > chọn suất > chọn ghế > giải thích trạng thái ghế (trống/đã chọn/đã đặt).
- **Câu hỏi thầy cô:** Frontend là gì? `fetch()` làm gì? Vì sao dùng `async/await`? Sự khác nhau giữa GET và POST? CSS responsive hoạt động thế nào?
- **Trả lời ngắn:** Frontend là phần người dùng nhìn thấy. `fetch()` gửi HTTP request lên backend; `await` chờ phản hồi bất đồng bộ. GET đọc dữ liệu, POST gửi dữ liệu để tạo mới.

## Thành viên 2 — TÀI KHOẢN & BACKEND
**File phụ trách:** `server/auth.js`; phần cấu hình Express, `/api/register`, `/api/login`, `/api/logout` trong `server/index.js`.

- Giải thích mô hình client–server, Express, API, `express.json()`, middleware xác thực.
- Demo: tạo tài khoản > đăng nhập > đăng xuất; thử truy cập chức năng quản trị bằng tài khoản thường.
- Giải thích mật khẩu `scrypt` và `salt`, token phiên đăng nhập, phân quyền admin / user.
- **Câu hỏi thầy cô:** Node.js/Express là gì? API là gì? Middleware là gì? Mật khẩu được lưu thế nào? HTTP 401 và 403 khác nhau thế nào?
- **Trả lời ngắn:** Express tạo server và xử lý tuyến API; middleware kiểm tra trước khi xử lý yêu cầu. 401 là chưa được xác thực, 403 là đã xác thực nhưng không có quyền. Mật khẩu không lưu dạng văn bản gốc.

## Thành viên 3 — DỮ LIỆU & ĐẶT VÉ
**File phụ trách:** `server/store.js`, `data/database.json`; API vé, suất chiếu, phim trong `server/index.js`.

- Giải thích cách lưu các mảng `users`, `movies`, `showtimes`, `bookings` trong JSON.
- Giải thích liên kết bằng `movieId`, `showtimeId`, `userId`, không cho đặt trùng ghế theo cùng suất.
- Demo: đặt vé A1 > xem Vé của tôi > chọn lại A1 thấy bị khóa; đăng nhập admin và thêm/sửa/xóa phim mới.
- **Câu hỏi thầy cô:** CRUD nghĩa là gì? Dữ liệu được lưu ở đâu? Tại sao cần `id`? Vì sao phải kiểm tra ghế trùng ở backend, không chỉ frontend?
- **Trả lời ngắn:** CRUD là Create, Read, Update, Delete. `id` định danh mỗi bản ghi, liên kết phim, suất chiếu và vé. Backend phải kiểm tra để ngăn hai người gửi đặt cùng một ghế.

## Kịch bản trình bày 9–12 phút

| Thời gian | Người trình bày | Nội dung |
|---|---|---|
| 0:00–1:00 | Người 1 | Giới thiệu đề tài, công nghệ, lý do rút gọn |
| 1:00–4:00 | Người 1 | Demo giao diện, tìm phim, chọn suất, chọn ghế |
| 4:00–7:00 | Người 2 | Giải thích API, đăng ký/đăng nhập, phân quyền |
| 7:00–10:00 | Người 3 | Demo đặt vé, chống trùng ghế, admin CRUD phim, dữ liệu JSON |
| 10:00–12:00 | Cả nhóm | Tổng kết và trả lời câu hỏi |

## 5 câu vấn đáp chung

**1. Vì sao chọn đề tài?** Hệ thống đặt vé minh họa được các chức năng giao diện, API, xác thực tài khoản và lưu dữ liệu trong một dự án hoàn chỉnh.

**2. Điểm khác với CineLoyalty gốc?** Giữ ý tưởng cốt lõi nhưng bỏ thanh toán, tích điểm, cloud upload, nhiều chi nhánh; đổi React + MySQL thành HTML/CSS/JS + JSON để đơn giản hóa cài đặt.

**3. Khi người dùng chọn ghế, chuyện gì diễn ra?** Frontend lấy ghế đã đặt; khi xác nhận, backend kiểm tra tài khoản, suất chiếu, ghế hợp lệ và ghế chưa trùng; sau đó ghi vé.

**4. Có thể triển khai thực tế không?** Bản này dùng để học và demo. Để triển khai thực tế cần database như MySQL, xác thực/cookie an toàn, chống cạnh tranh khi đặt vé, kiểm thử và giám sát.

**5. Nhóm đã phân chia như thế nào?** Người 1 giao diện và gọi API; người 2 quản lý tài khoản và bảo vệ API; người 3 dữ liệu, đặt vé và CRUD. Các phần kết nối bằng HTTP API.

## Checklist trước khi vấn đáp

- [ ] Tất cả thành viên chạy được `npm install` và `npm start`.
- [ ] Người 1 biết giải thích các hàm `renderMovies`, `renderShowtimes`, `showSeats`, `api`.
- [ ] Người 2 biết chỉ ra `register`, `login`, `authenticate`, `admin`.
- [ ] Người 3 biết chỉ ra `seatTaken`, `writeDB`, các endpoint đặt vé.
- [ ] Test đăng ký mới, đăng nhập, đặt ghế, xem vé, sửa phim.
- [ ] Không demo xóa phim đã có suất chiếu; thêm phim mới rồi xóa phim mới.
- [ ] Không nhập dữ liệu cá nhân hoặc mật khẩu thật khi demo.
