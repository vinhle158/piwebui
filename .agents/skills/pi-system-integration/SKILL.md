---
name: pi-system-integration
description: Hướng dẫn tích hợp với hệ điều hành Linux trên Raspberry Pi — sudoers config, subprocess an toàn, đọc /sys/ và /proc/, systemd service template.
---

# Pi System Integration

## 1. Cấu hình Sudoers — Tối thiểu quyền cần thiết

Tạo file `/etc/sudoers.d/piwebui` (KHÔNG chỉnh sửa `/etc/sudoers` trực tiếp):

```bash
# /etc/sudoers.d/piwebui
# Cho phép user 'pi' chạy các lệnh cụ thể mà không cần password
pi ALL=(ALL) NOPASSWD: /bin/systemctl start piwebui
pi ALL=(ALL) NOPASSWD: /bin/systemctl stop piwebui
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart piwebui
pi ALL=(ALL) NOPASSWD: /bin/systemctl start nginx
pi ALL=(ALL) NOPASSWD: /bin/systemctl stop nginx
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart nginx
pi ALL=(ALL) NOPASSWD: /sbin/reboot
pi ALL=(ALL) NOPASSWD: /sbin/shutdown -h now
```

Sau đó set permission đúng:
```bash
sudo chmod 440 /etc/sudoers.d/piwebui
sudo visudo -c  # Validate syntax trước khi dùng
```

---

## 2. Đọc Thông số Phần cứng qua /sys/ và /proc/

Ưu tiên đọc trực tiếp từ filesystem thay vì gọi lệnh shell — nhanh hơn và không cần subprocess:

```python
# backend/services/system_info.py
import psutil
from pathlib import Path
from datetime import datetime, timezone

def get_cpu_temperature() -> float | None:
    """Đọc nhiệt độ CPU từ sysfs thermal zone."""
    temp_path = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        # Kernel báo milli-Celsius → chia 1000 ra °C
        return int(temp_path.read_text().strip()) / 1000.0
    except (FileNotFoundError, ValueError):
        # Một số Pi model dùng vcgencmd — fallback
        return _get_temp_via_vcgencmd()

def _get_temp_via_vcgencmd() -> float | None:
    import subprocess
    try:
        result = subprocess.run(
            ["vcgencmd", "measure_temp"],   # List arg — không phải shell string
            capture_output=True, text=True, timeout=2
        )
        # Output: "temp=45.7'C"
        return float(result.stdout.split("=")[1].replace("'C\n", ""))
    except Exception:
        return None

def get_system_stats() -> dict:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_percent":        psutil.cpu_percent(interval=0.1),
        "cpu_freq_mhz":       psutil.cpu_freq().current if psutil.cpu_freq() else None,
        "cpu_temp_celsius":   get_cpu_temperature(),
        "ram_total_bytes":    mem.total,
        "ram_used_bytes":     mem.used,
        "ram_percent":        mem.percent,
        "disk_total_bytes":   disk.total,
        "disk_used_bytes":    disk.used,
        "disk_percent":       disk.percent,
        "uptime_seconds":     int(datetime.now(timezone.utc).timestamp() - psutil.boot_time()),
        "timestamp":          datetime.now(timezone.utc).isoformat(),
    }

def get_network_interfaces() -> list[dict]:
    """Liệt kê các network interface và địa chỉ IP."""
    interfaces = []
    for name, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family.name == "AF_INET":  # IPv4 only
                interfaces.append({"interface": name, "ip": addr.address})
    return interfaces
```

---

## 3. Systemd Service Template

```ini
# systemd/piwebui.service
[Unit]
Description=Pi WebUI — Raspberry Pi Control Panel
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/piwebui/backend
ExecStart=/home/pi/piwebui/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
# Giới hạn tài nguyên — quan trọng trên Pi
MemoryMax=256M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

Cài đặt:
```bash
sudo cp systemd/piwebui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable piwebui  # Tự động start khi boot
sudo systemctl start piwebui
```

---

## 4. Atomic Write — An toàn khi mất điện

```python
import os
import tempfile
from pathlib import Path

def atomic_write(file_path: Path, content: str) -> None:
    """Ghi file an toàn: ghi ra file tạm → đổi tên (rename là atomic trên Linux)."""
    dir_path = file_path.parent
    # Tạo file tạm cùng thư mục để đảm bảo cùng filesystem (rename mới atomic)
    with tempfile.NamedTemporaryFile(
        mode='w', dir=dir_path, delete=False, suffix='.tmp'
    ) as tmp:
        tmp.write(content)
        tmp.flush()
        os.fsync(tmp.fileno())  # Đảm bảo data xuống disk trước khi rename
        tmp_path = tmp.name
    
    # rename() là atomic operation trên Linux — không bao giờ bị trạng thái giữa chừng
    os.rename(tmp_path, file_path)
```

---

## 5. Danh sách /proc/ và /sys/ thường dùng

| Thông tin | Path |
|-----------|------|
| Nhiệt độ CPU | `/sys/class/thermal/thermal_zone0/temp` |
| Tần số CPU | `/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq` |
| Model Pi | `/proc/device-tree/model` |
| Thông tin CPU | `/proc/cpuinfo` |
| Thông tin RAM | `/proc/meminfo` |
| Uptime | `/proc/uptime` |
| Tải hệ thống | `/proc/loadavg` |
| GPU Memory split | `vcgencmd get_mem gpu` |
