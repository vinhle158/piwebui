---
name: pi-hardware-optimization
description: Nguyên tắc và cấu hình cụ thể để chạy bền bỉ trên Raspberry Pi — bảo vệ SD card, giới hạn RAM, xử lý mất điện.
---

# Pi Hardware Optimization

## 1. Bảo vệ SD Card — Cấu hình tmpfs

Giảm ghi xuống SD card bằng cách mount các thư mục ghi nhiều vào RAM:

```bash
# Thêm vào /etc/fstab
tmpfs   /tmp              tmpfs  defaults,noatime,nosuid,size=64m     0 0
tmpfs   /var/log          tmpfs  defaults,noatime,nosuid,size=32m     0 0
tmpfs   /var/tmp          tmpfs  defaults,noatime,nosuid,size=16m     0 0
```

Cấu hình journald để log vào RAM thay vì disk:
```ini
# /etc/systemd/journald.conf
[Journal]
Storage=volatile        # Chỉ ghi vào /run/log/journal (RAM)
RuntimeMaxUse=32M       # Giới hạn dung lượng log trong RAM
```

---

## 2. SQLite WAL Mode — Cấu hình Tối ưu cho Pi

```python
# backend/db/database.py — init_db()
def _configure_connection(conn: sqlite3.Connection):
    """Áp dụng PRAGMA tối ưu mỗi khi tạo connection mới."""
    # WAL: an toàn khi mất điện, không lock reader khi writer đang chạy
    conn.execute("PRAGMA journal_mode=WAL")
    # NORMAL: fsync sau mỗi WAL checkpoint, không phải mỗi transaction → nhanh hơn
    conn.execute("PRAGMA synchronous=NORMAL")
    # Cache 4MB trong RAM thay vì đọc disk mỗi query
    conn.execute("PRAGMA cache_size=-4000")
    # Xóa page không dùng để giảm dung lượng file
    conn.execute("PRAGMA auto_vacuum=INCREMENTAL")
    # Busy timeout 5s — tránh crash khi nhiều request đến cùng lúc
    conn.execute("PRAGMA busy_timeout=5000")
```

---

## 3. Giới hạn Tài nguyên qua systemd

Đã cấu hình trong `piwebui.service`:
```ini
[Service]
MemoryMax=256M    # App không được dùng quá 256MB RAM
MemorySwapMax=0   # Không dùng swap — swap trên SD card giết thẻ nhớ
CPUQuota=80%      # Không chiếm toàn bộ CPU, để OS vẫn hoạt động
```

---

## 4. Log Rotation — Ngăn log làm đầy RAM

```python
# backend/config.py — cấu hình logging
import logging
from logging.handlers import RotatingFileHandler
import sys

def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Log ra stdout → journald xử lý (đã cấu hình volatile)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    ))
    logger.addHandler(handler)
    
    # KHÔNG dùng FileHandler trỏ vào SD card
    # journald với Storage=volatile đã xử lý rồi
```

---

## 5. Theo dõi Ngưỡng Cảnh báo

```python
# backend/services/system_info.py
THRESHOLDS = {
    "cpu_temp_danger":   80.0,   # °C — throttle tự động ở 85°C
    "cpu_temp_warning":  65.0,   # °C
    "ram_percent_danger": 90.0,  # % — gần OOM
    "ram_percent_warning": 75.0, # %
    "disk_percent_danger": 90.0, # %
}

def get_alert_level(stats: dict) -> str:
    """Trả về 'danger', 'warning', hoặc 'ok'."""
    temp = stats.get("cpu_temp_celsius") or 0
    if (temp >= THRESHOLDS["cpu_temp_danger"] or
        stats["ram_percent"] >= THRESHOLDS["ram_percent_danger"] or
        stats["disk_percent"] >= THRESHOLDS["disk_percent_danger"]):
        return "danger"
    if (temp >= THRESHOLDS["cpu_temp_warning"] or
        stats["ram_percent"] >= THRESHOLDS["ram_percent_warning"]):
        return "warning"
    return "ok"
```

---

## 6. Tối ưu Boot — Tắt các service không cần thiết

```bash
# Chạy sau khi cài xong
sudo systemctl disable bluetooth   # Nếu không dùng Bluetooth
sudo systemctl disable avahi-daemon # mDNS — không cần nếu dùng WireGuard
sudo systemctl disable triggerhappy # Keyboard shortcut daemon

# Kiểm tra service nào đang chạy và thời gian boot
systemd-analyze blame | head -20
```

---

## Checklist Trước khi Deploy lên Pi

- [ ] `tmpfs` đã được mount cho `/tmp` và `/var/log`
- [ ] `journald` đã set `Storage=volatile`
- [ ] SQLite WAL mode đã bật
- [ ] `MemorySwapMax=0` trong service file
- [ ] Thư mục DB (`/var/lib/piwebui/`) nằm trên SD card chính, không phải `/tmp` (cần persist)
- [ ] Đã tắt các service không cần (bluetooth, avahi)
