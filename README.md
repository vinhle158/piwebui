# Pi WebUI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%20OS-red.svg)](https://www.raspberrypi.com/software/)
[![Aesthetic](https://img.shields.io/badge/design-CasaOS%20Inspired-brightgreen.svg)]()

Một bảng điều khiển gọn nhẹ, hiện đại, an toàn và tự lưu trữ (self-hosted) được thiết kế dành riêng cho Raspberry Pi. Được truyền cảm hứng từ giao diện desktop tinh tế của **CasaOS**, Pi WebUI cung cấp giao diện web cao cấp giúp giám sát thông số phần cứng, quản lý dịch vụ hệ thống, duyệt tập tin, và chạy terminal tương tác trực tiếp mà không cần phụ thuộc vào bất kỳ dịch vụ cloud trung gian nào (hoàn toàn offline-first).

---

## 🖥️ Giao Diện & Triết Lý Thiết Kế
Pi WebUI được xây dựng với ngôn ngữ thiết kế tối giản (dark-mode) sang trọng, bao gồm:
* **Giao diện Glassmorphism:** Các thẻ chứa thông tin bán trong suốt, hiệu ứng mờ nền tinh tế và ánh sáng phát quang hiện đại.
* **Tương thích đa thiết bị:** Tự động tối ưu hóa hiển thị trên cả màn hình máy tính lớn và thiết bị di động.
* **Hiệu ứng mượt mà (Micro-animations):** Các tương tác hover nhẹ nhàng, đèn trạng thái nhấp nháy sinh động.
* **Widgets Thông Số:** Các vòng đo tiến trình cập nhật trực tiếp cho CPU, RAM, dung lượng đĩa và nhiệt độ hệ thống.

---

## 🚀 Các Tính Năng Nổi Bật

* **Giám Sát Hệ Thống Thời Gian Thực:** Truyền tải trực tiếp các thông số phần cứng (tải CPU, xung nhịp, nhiệt độ CPU, dung lượng RAM, dung lượng ổ đĩa và trạng thái các cổng mạng) thông qua Server-Sent Events (SSE) cực kỳ tiết kiệm tài nguyên.
* **Quản Lý Dịch Vụ Hệ Thống:** Bật, tắt, khởi động lại và theo dõi trạng thái các dịch vụ systemd cốt lõi (như SSH, Nginx, Docker, v.v.) trực quan trên web.
* **Terminal Tương Tác Trực Tuyến:** Tích hợp cửa sổ dòng lệnh trực tiếp trên trình duyệt sử dụng công nghệ **xterm.js** và WebSockets, cho phép bạn thao tác SSH từ xa thông qua giao diện Web mà không cần mở port 22 ra ngoài.
* **Quản Lý Tập Tin (File Manager):** Duyệt thư mục, tải xuống, chỉnh sửa và tải tệp tin lên nhanh chóng. Sử dụng cơ chế **ghi tệp tin nguyên tử (atomic write)** để đảm bảo an toàn tuyệt đối, tránh hỏng hệ thống khi mất điện đột ngột.
* **Hoàn Toàn Offline (Offline-first):** Không sử dụng bất kỳ thư viện hay CDN bên ngoài nào. Toàn bộ mã nguồn, font chữ (Inter), biểu tượng (Lucide SVG) đều được lưu trữ trực tiếp trên thiết bị Pi của bạn.

---

## 🛠️ Công Nghệ Sử Dụng

| Thành Phần | Công Nghệ | Lý Do Chọn Lựa |
| :--- | :--- | :--- |
| **Backend** | Python 3.11+ / FastAPI | Hỗ trợ tối ưu trên Raspberry Pi, sử dụng ít tài nguyên RAM, tích hợp tốt với các API hệ thống và WebSockets. |
| **Frontend** | HTML5, Vanilla CSS, JS (ES Modules) | Không cần bước đóng gói (no build step), nhẹ nhất có thể và hoạt động hoàn hảo khi offline. |
| **Database** | SQLite 3 (WAL Mode) | Không cần cài đặt daemon độc lập, tiết kiệm tài nguyên và bảo vệ toàn vẹn dữ liệu khi mất điện. |
| **Giao Tiếp** | SSE (Server-Sent Events) & WebSockets | Dùng SSE cho việc cập nhật thông số hệ thống để tiết kiệm pin/CPU; dùng WebSockets cho terminal hai chiều. |
| **Quản Lý Tiến Trình** | systemd | Dịch vụ hệ thống Linux tiêu chuẩn giúp tự khởi động lại khi crash và giới hạn tài nguyên tối đa cho ứng dụng. |

---

## 📦 Hướng Dẫn Cài Đặt & Triển Khai

### 1. Yêu cầu hệ thống
Đảm bảo thiết bị của bạn đang chạy hệ điều hành **Raspberry Pi OS 11 (Bullseye)** hoặc **12 (Bookworm)**.

### 2. Tải mã nguồn về Pi
Chạy lệnh sau trên terminal của Pi:
```bash
git clone https://github.com/vinhle158/piwebui.git ~/piwebui
cd ~/piwebui
```

### 3. Tải các tài nguyên Offline (Fonts & Icons)
Chạy script để tải các tài nguyên giao diện về lưu trữ nội bộ:
```bash
python3 scripts/download_assets.py
```

### 4. Tạo cấu hình môi trường
Khởi tạo cấu hình môi trường:
```bash
cp .env.example backend/.env
```
Chỉnh sửa file `backend/.env` nếu bạn muốn thay đổi thư mục quản lý tập tin hoặc danh sách dịch vụ:
```ini
HOST=0.0.0.0
PORT=8080
DB_PATH=/var/lib/piwebui/data.db
ALLOWED_SERVICES=piwebui,nginx,ssh,bluetooth,cron,networking
FILE_MANAGER_ROOT=/home/admin   # Đổi thành thư mục home của bạn
```

### 5. Chạy script cài đặt tự động
Cấp quyền thực thi và chạy script (chạy với quyền user thường, **KHÔNG dùng `sudo` trực tiếp**):
```bash
chmod +x scripts/install.sh
./scripts/install.sh
```
*Script sẽ tự động cài các gói phụ thuộc hệ thống, tạo môi trường ảo Python (`venv`), cấu hình dịch vụ systemd và phân quyền sudo không mật khẩu cho một số lệnh hệ thống nhất định.*

---

## ⚡ Các Tối Ưu Hóa Dành Riêng Cho Raspberry Pi

Thẻ nhớ SD của Pi rất dễ bị giảm tuổi thọ hoặc hỏng do tác vụ ghi dữ liệu liên tục. Pi WebUI áp dụng các giải pháp bảo vệ tối đa:

1. **SQLite WAL Mode:** Sử dụng cơ chế ghi nhật ký Write-Ahead Logging cùng cấu hình `PRAGMA synchronous=NORMAL` để gộp các tác vụ ghi đè và ngăn ngừa lỗi tệp tin khi mất điện đột ngột.
2. **Volatile Logging (Ghi log vào RAM):** Nhật ký hệ thống được ghi ra `stdout` để hệ thống `systemd-journald` thu thập và lưu trữ trực tiếp trong RAM.
3. **Mount tmpfs:** Khuyên dùng cấu hình đưa các thư mục ghi tạm thời vào RAM bằng cách thêm các dòng sau vào file `/etc/fstab`:
   ```ini
   tmpfs   /tmp              tmpfs  defaults,noatime,nosuid,size=64m     0 0
   tmpfs   /var/log          tmpfs  defaults,noatime,nosuid,size=32m     0 0
   tmpfs   /var/tmp          tmpfs  defaults,noatime,nosuid,size=16m     0 0
   ```
4. **Giới hạn tài nguyên dịch vụ:** Dịch vụ `piwebui.service` được giới hạn tối đa `256MB` RAM và `80%` CPU để luôn đảm bảo hệ điều hành Pi chạy mượt mà, không bị tràn RAM (OOM).

---

## 📄 Giấy Phép
Dự án được phân phối dưới giấy phép MIT License - xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

## 👥 Tham Gia Đóng Góp
Mọi đóng góp, báo lỗi hoặc đề xuất tính năng mới đều được chào đón! Hãy gửi Issue hoặc Pull Request trên trang GitHub của dự án.
