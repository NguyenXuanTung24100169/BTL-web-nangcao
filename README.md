# MINI CINEMA — Website đặt vé xem phim (đồ án cuối kỳ)

Bản thu gọn theo ý tưởng hệ thống **CineLoyalty** đã cung cấp, ưu tiên **dễ chạy, dễ demo và dễ vấn đáp**. Dùng **HTML/CSS/JavaScript thuần + Node.js + Express + JSON**, không cần cài MySQL, React, API bên thứ ba hay thanh toán thật.

## Chạy trên Windows / VS Code

1. Giải nén thư mục `MiniCinema-CuoiKy`.
2. Mở **đúng thư mục này** trong VS Code (`File > Open Folder`).
3. Mở Terminal (`Ctrl + ~`) chạy:

   ```bash
   npm install
   npm start
   ```

4. Mở trình duyệt: **http://localhost:3000**.
5. Dừng server: `Ctrl + C`.

Chỉ cần **1 terminal** (không cần mở 2 terminal frontend/backend). Có thể chạy `npm run dev` để server tự khởi động lại khi sửa code backend (Node.js >= 18).

**Tài khoản quản trị demo**: `admin@mini.vn` / `Admin123!`.

**Tài khoản khách hàng**: Bấm **Đăng nhập > Đăng ký**, tự tạo email và mật khẩu tối thiểu 6 ký tự.

## Các chức năng

| STT | Chức năng | Demo |
|---|---|---|
| 1 | Danh sách & tìm kiếm phim | Gõ tên phim trên Trang chủ |
| 2 | Đăng ký / đăng nhập / đăng xuất | Bấm Đăng nhập; tạo tài khoản |
| 3 | Chọn suất chiếu & ghế | Bấm Đặt vé > chọn giờ > chọn ghế > xác nhận |
| 4 | Vé của tôi | Sau khi đặt, vào Vé của tôi |
| 5 | Quản trị phim | Đăng nhập admin > Quản trị > Thêm/Sửa/Xóa phim |

**Lưu ý:** Phim demo đã gắn suất chiếu nên không được xóa để tránh làm hỏng dữ liệu vé. Có thể thêm một phim mới rồi xóa phim đó để demo chức năng xóa. Phim mới thêm chưa có suất chiếu (bản đơn giản chưa có màn quản trị suất chiếu).

## Cấu trúc dự án và phân công nhóm

```text
MiniCinema-CuoiKy/
├─ public/
│  ├─ index.html       # Thành viên 1: Giao diện HTML
│  ├─ style.css        # Thành viên 1: Giao diện CSS
│  └─ app.js           # Thành viên 1: Javascript, fetch API
├─ server/
│  ├─ auth.js          # Thành viên 2: đăng ký, đăng nhập, xác thực
│  ├─ index.js         # Thành viên 2 + 3: khai báo API, đặt vé, CRUD phim
│  └─ store.js         # Thành viên 3: đọc/ghi dữ liệu và kiểm tra ghế
├─ data/
│  └─ database.json    # Thành viên 3: phim, suất chiếu, người dùng, vé
├─ tests/
│  └─ app.test.js      # Kiểm thử logic
├─ PHAN_CONG_VA_VAN_DAP.md
└─ package.json
```

Đề xuất cách phân chia riêng file `server/index.js`: **Thành viên 2** thuyết trình tuyến API `/api/register`, `/api/login`, `/api/logout` và middleware `authenticate`; **Thành viên 3** thuyết trình các API `/api/bookings`, `/api/my-bookings`, `/api/showtimes` và `/api/movies`.

## Luồng hoạt động

**Trình duyệt (public/app.js)** → `fetch('/api/...')` → **Express (server/index.js)** → **xử lý đăng nhập (auth.js) / dữ liệu (store.js)** → **data/database.json** → JSON trả về → giao diện cập nhật.

Ví dụ đặt vé: chọn phim > chọn suất chiếu > hiển thị ghế đã đặt > chọn một ghế trống > POST `/api/bookings` > API kiểm tra trùng ghế > ghi vào `database.json` > hiển thị trong 'Vé của tôi'.

## API cơ bản

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/movies` | Lấy phim |
| GET | `/api/showtimes` | Lấy suất chiếu |
| GET | `/api/showtimes/:id/seats` | Ghế đã đặt |
| POST | `/api/register` | Đăng ký |
| POST | `/api/login` | Đăng nhập |
| POST | `/api/logout` | Đăng xuất (cần token) |
| GET | `/api/my-bookings` | Vé của tôi (cần token) |
| POST | `/api/bookings` | Đặt vé (cần token) |
| POST/PUT/DELETE | `/api/movies` hoặc `/api/movies/:id` | Quản lý phim (admin) |

Các API cần đăng nhập sử dụng header `Authorization: Bearer <token>`. Mật khẩu được lưu bằng **scrypt + salt**, không lưu mật khẩu gốc.

## Kiểm thử

```bash
npm test
```

## Giới hạn đồ án

Đây là **mô hình demo học tập**: dùng JSON thay cơ sở dữ liệu thực, token lưu RAM (khởi động lại phải đăng nhập lại), lịch chiếu đặt sẵn theo thứ trong tuần, không xử lý thanh toán, không cam kết bảo đảm cạnh tranh đồng thời nhiều tiến trình và chưa triển khai bảo mật production. Nên chạy một instance Node.js, không đưa công khai lên Internet khi chưa hoàn thiện bảo mật. Dữ liệu phim, ghế và tài khoản tạo mới được lưu trong `data/database.json`.

**Khắc phục lỗi:** Nếu Terminal báo `Cannot find module 'express'` → chạy `npm install` đúng thư mục có `package.json`. Nếu báo cổng 3000 đang được dùng → dừng server cũ (`Ctrl+C`), hoặc chạy `set PORT=3001 && npm start` trên CMD. Nếu mở `index.html` trực tiếp bằng file://, API sẽ không chạy; phải truy cập `http://localhost:3000`.
