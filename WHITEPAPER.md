# Tài Liệu Kiến Trúc & Thiết Kế Hệ Thống: Pi WebUI

## 1. Tóm Tắt Dự Án

Việc quản lý các thiết bị Raspberry Pi chạy chế độ không màn hình (headless) thường đặt người dùng vào hai sự lựa chọn: hoặc sử dụng dòng lệnh phức tạp (SSH), hoặc cài đặt các bảng điều khiển cồng kềnh, tiêu tốn nhiều tài nguyên hệ thống (như Webmin, Cockpit) hoặc phụ thuộc vào các dịch vụ đám mây trung gian.

**Pi WebUI** mang đến một giải pháp thay thế tự lưu trữ (self-hosted), siêu nhẹ và hiện đại. Được truyền cảm hứng từ giao diện quản lý dạng desktop trực quan của **CasaOS**, dự án hướng tới sự hoàn mỹ về mặt thị giác nhưng vẫn hoạt động mượt mà trong giới hạn tài nguyên cực kỳ nghiêm ngặt (dưới 256MB RAM). Hệ thống hoạt động theo triết lý ngoại tuyến hoàn toàn (offline-first), loại bỏ hoàn toàn việc sử dụng CDN hoặc các kết nối đám mây bên ngoài để đảm bảo tính riêng tư và tốc độ tối đa.

Tài liệu này trình bày chi tiết về thiết kế kiến trúc, mô hình bảo mật, các phương án tối ưu hóa phần cứng và các giao thức truyền thông được áp dụng trong Pi WebUI.

---

## 2. Kiến Trúc Hệ Thống & Triết Lý Thiết Kế

```
  ┌────────────────────────────────────────────────────────┐
  │                 Trình Duyệt Web (Client)                │
  │  ┌──────────────────┐ ┌──────────┐ ┌────────────────┐  │
  │  │ Vanilla JS / CSS │ │ xterm.js │ │ EventSource/WS │  │
  │  └────────┬─────────┘ └────┬─────┘ └───────▲────────┘  │
  └───────────┼────────────────┼───────────────┼───────────┘
              │ Yêu cầu HTTP   │ WebSocket     │ SSE / WS
              │ (APIs / files) │ (Terminal)    │ (Telemetry)
  ┌───────────┼────────────────┼───────────────┼───────────┐
  │           ▼                ▼               │           │
  │       FastAPI (Async Python Web Server)    │           │
  │       ┌────────────────────────────────────┴┐          │
  │       │       lifespan / event loop         │          │
  │       └──────┬──────────────────────┬───────┘          │
  │              │                      │                  │
  │              ▼                      ▼                  │
  │       SQLite 3 (WAL)         Dịch Vụ Hệ Thống          │
  │       (Lưu trữ dữ liệu)      (procfs, systemctl, PTY)  │
  │                                                        │
  │                   Phần Cứng Raspberry Pi               │
  └────────────────────────────────────────────────────────┘
```

Hệ thống được chia làm hai lớp tách biệt rõ ràng:
1. **Frontend Dashboard:** Ứng dụng đơn trang (SPA) xây dựng bằng HTML5 thuần, CSS Variables (Design Tokens) để quản lý giao diện đồng bộ, và Javascript ES Modules. Không có công cụ build, không có bước đóng gói trung gian hay thư viện cồng kềnh, giúp tải trang ngay lập tức.
2. **Backend Daemon:** Dịch vụ Python bất đồng bộ chạy trên nền tảng **FastAPI** và máy chủ **Uvicorn**, đóng vai trò là tác nhân điều khiển hệ thống. Backend trực tiếp giao tiếp với các tệp tin hệ thống Linux kernel (`/proc`, `/sys`), các API của dịch vụ systemd và cổng terminal ảo PTY.

### Các Nguyên Tắc Thiết Kế:
* **Không Phụ Thuộc Đám Mây:** Thiết bị hoạt động bình thường kể cả khi không có kết nối internet toàn cầu.
* **Thu Thập Thông Số Tối Giản:** Tác vụ giám sát hệ thống không được gây quá tải CPU hay tăng chu kỳ ghi vào bộ nhớ flash (thẻ SD).
* **Giảm Thiểu Đặc Quyền:** Dịch vụ backend chạy dưới tài khoản người dùng thông thường (`admin` hoặc `pi`), chỉ yêu cầu quyền hạn root thông qua cơ chế sudo giới hạn khi thực sự cần thiết.

---

## 3. Mô Hình Giao Tiếp & Thu Thập Thông Số

### 3.1. Truyền Tải Dữ Liệu Giám Sát (Server-Sent Events)
Để tránh việc sử dụng cơ chế HTTP Polling liên tục (gây lãng phí băng thông mạng nội bộ và tăng tải CPU), Pi WebUI sử dụng kênh truyền tải dữ liệu một chiều **Server-Sent Events (SSE)**.
* Các chỉ số về CPU, Xung nhịp, Nhiệt độ, RAM, Đĩa và Trạng thái mạng được backend thu thập thông qua thư viện `psutil` và đọc trực tiếp từ các file `/sys` hoặc `/proc`.
* Các thông số này được định dạng thành JSON và đẩy liên tục đến client qua luồng `EventSource` sau mỗi 1 đến 2 giây.
* Mô hình này duy trì một kết nối TCP duy nhất, giảm thiểu tối đa năng lượng tiêu thụ của chip ARM trên Pi.

### 3.2. Cửa Sổ Terminal Trực Tuyến (WebSockets + PTY)
Để hỗ trợ một cửa sổ dòng lệnh toàn diện ngay trên trình duyệt:
* Frontend sử dụng thư viện chuyên dụng **xterm.js** để giả lập terminal, xử lý hiển thị và bắt các sự kiện gõ phím.
* Việc giao tiếp hai chiều thời gian thực được đảm nhận bởi **WebSockets** thông qua endpoint `/ws/terminal`.
* Ở phía backend, Python gọi hàm hệ thống `os.forkpty()` để sinh ra một terminal ảo (PTY) chạy shell `bash` dưới danh nghĩa tài khoản của người dùng.
* Các luồng xử lý bất đồng bộ liên tục đọc/ghi dữ liệu qua lại giữa PTY và WebSocket với độ trễ cực thấp.

---

## 4. Tối Ưu Phần Cứng & Hạn Chế Hao Mòn Thẻ Nhớ SD

Một trong những nguyên nhân phổ biến nhất khiến Raspberry Pi bị hỏng hệ điều hành là do thẻ nhớ SD bị hỏng (corrupted) vì tần suất ghi dữ liệu quá lớn. Pi WebUI tích hợp sẵn các giải pháp kiến trúc để bảo vệ phần cứng:

### 4.1. SQLite Write-Ahead Logging (WAL)
Các giao dịch ghi tiêu chuẩn của SQLite tạo ra rất nhiều thao tác đồng bộ trực tiếp lên tệp tin dữ liệu chính. Pi WebUI cấu hình lại hoạt động của SQLite:
* **Bật chế độ WAL:** Các thao tác ghi được ghi nối tiếp vào một tệp nhật ký phụ `.log` riêng biệt, cho phép đọc và ghi diễn ra song song mà không khóa lẫn nhau.
* **Cấu hình PRAGMA synchronous = NORMAL:** Database chỉ ghi đồng bộ xuống đĩa vật lý tại các điểm kiểm tra (checkpoint) thay vì sau mỗi giao dịch nhỏ. Điều này giúp giảm số lần ghi vật lý lên thẻ SD đi hàng trăm lần.
* **Cấu hình PRAGMA cache_size = -4000:** Tăng dung lượng cache lưu trữ dữ liệu tạm thời lên 4MB trong RAM, giúp các tác vụ đọc dữ liệu hạn chế tối đa việc truy xuất trực tiếp vào thẻ nhớ.

### 4.2. Ghi Tệp Nguyên Tử (Atomic Writes) & Ghi Log Trạm
* **Ghi Log trên RAM:** Nhật ký hoạt động của ứng dụng được đẩy trực tiếp ra `stdout` để hệ thống `systemd-journald` tiếp nhận. Trong cấu hình hệ thống, file log được chuyển sang chế độ `volatile` để chỉ lưu trữ tạm thời trong RAM thay vì ghi xuống thẻ SD.
* **Tác vụ ghi tệp an toàn:** Khi chỉnh sửa tệp tin hệ thống (như cấu hình mạng, quản lý file), backend sẽ ghi ra một file tạm trước, đồng bộ dữ liệu bằng `os.fsync()`, sau đó dùng lệnh đổi tên `os.rename()` để ghi đè tệp tin gốc. Trên nhân Linux, `rename` là một thao tác nguyên tử (atomic operation), đảm bảo không bao giờ xảy ra tình trạng tệp tin bị hỏng nửa chừng khi mất điện đột ngột.

---

## 5. Kiến Trúc Bảo Mật

### 5.1. Dịch Vụ Không Chạy Quyền Root
Chạy dịch vụ web điều khiển hệ thống bằng quyền root là một lỗ hổng bảo mật nghiêm trọng.
* Pi WebUI daemon chạy dưới quyền user thông thường (`admin` hoặc `pi`).
* Để thực hiện các tác vụ hệ thống (như điều khiển dịch vụ systemctl, khởi động lại máy), script cài đặt tạo ra một file cấu hình sudoers chuyên biệt tại `/etc/sudoers.d/piwebui`.
* File cấu hình này chỉ cho phép user chạy các lệnh chỉ định cụ thể không cần mật khẩu và tuyệt đối không cấp quyền sudo toàn phần:
  ```bash
  admin ALL=(ALL) NOPASSWD: /bin/systemctl start *
  admin ALL=(ALL) NOPASSWD: /bin/systemctl stop *
  admin ALL=(ALL) NOPASSWD: /bin/systemctl restart *
  admin ALL=(ALL) NOPASSWD: /sbin/reboot
  admin ALL=(ALL) NOPASSWD: /sbin/shutdown
  ```

### 5.2. Cô Lập Thư Mục Quản Lý File
Để tránh lỗ hổng duyệt thư mục ngược dòng (directory traversal):
* Giá trị cấu hình `FILE_MANAGER_ROOT` thiết lập giới hạn cho phép (ví dụ `/home/admin`).
* Hệ thống sử dụng thư viện `pathlib.Path` để chuẩn hóa đường dẫn và kiểm tra nghiêm ngặt xem đường dẫn yêu cầu có nằm trong phạm vi thư mục gốc hay không.
* Chặn hoàn toàn việc truy cập trực tiếp đến các file hệ thống nhạy cảm như `/etc/shadow` hay `/etc/sudoers`.
