---
name: clean-code-principles
description: Các tiêu chuẩn và nguyên tắc viết code sạch, dễ đọc, dễ bảo trì áp dụng cho Python (backend) và JavaScript (frontend) trong dự án Pi WebUI.
---

# Clean Code — Python & JavaScript

Dự án dùng **Python** cho backend và **Vanilla JS** cho frontend. Mọi nguyên tắc dưới đây đều có ví dụ thực tế.

---

## 1. Đặt tên có ý nghĩa (Meaningful Naming)

### Python
```python
# ❌ Sai
def get(t):
    return open(f"/sys/class/thermal/thermal_zone{t}/temp").read()

# ✅ Đúng
def read_cpu_temperature(zone: int = 0) -> float:
    """Đọc nhiệt độ CPU từ sysfs, trả về °C."""
    raw = open(f"/sys/class/thermal/thermal_zone{zone}/temp").read()
    return int(raw) / 1000.0
```

### JavaScript
```javascript
// ❌ Sai
const d = await fetch('/api/system/stats').then(r => r.json());

// ✅ Đúng
const systemStats = await fetchSystemStats();
```

**Quy ước đặt tên:**
- Python: `snake_case` cho function/variable, `PascalCase` cho class
- JavaScript: `camelCase` cho function/variable, `PascalCase` cho class, `UPPER_SNAKE_CASE` cho hằng số

---

## 2. Single Responsibility — Mỗi hàm một việc

```python
# ❌ Sai — một hàm làm 3 việc
def get_system_overview():
    cpu = psutil.cpu_percent()
    ram = psutil.virtual_memory()
    # đọc temp
    temp = int(open("/sys/class/thermal/thermal_zone0/temp").read()) / 1000
    return {"cpu": cpu, "ram": ram.percent, "temp": temp}

# ✅ Đúng — tách thành các hàm riêng biệt
def get_cpu_usage() -> float:
    return psutil.cpu_percent(interval=0.1)

def get_ram_usage() -> dict:
    mem = psutil.virtual_memory()
    return {"total": mem.total, "used": mem.used, "percent": mem.percent}

def get_cpu_temperature(zone: int = 0) -> float:
    raw = open(f"/sys/class/thermal/thermal_zone{zone}/temp").read()
    return int(raw) / 1000.0

def get_system_stats() -> dict:
    """Aggregate — gọi các hàm riêng."""
    return {
        "cpu": get_cpu_usage(),
        "ram": get_ram_usage(),
        "temp": get_cpu_temperature(),
    }
```

---

## 3. Error Handling — Không nuốt lỗi

```python
# ❌ Sai
def get_cpu_temperature() -> float:
    try:
        raw = open("/sys/class/thermal/thermal_zone0/temp").read()
        return int(raw) / 1000.0
    except:
        return 0  # Nuốt lỗi, không ai biết có chuyện gì xảy ra

# ✅ Đúng
import logging
logger = logging.getLogger(__name__)

def get_cpu_temperature() -> float | None:
    try:
        raw = open("/sys/class/thermal/thermal_zone0/temp").read()
        return int(raw.strip()) / 1000.0
    except FileNotFoundError:
        logger.warning("thermal_zone0 không tồn tại — Pi model này không hỗ trợ?")
        return None
    except ValueError as e:
        logger.error(f"Không parse được nhiệt độ: {e}")
        return None
```

---

## 4. DRY — Tránh lặp code

```javascript
// ❌ Sai — Fetch lặp đi lặp lại ở mọi nơi
const cpu = await fetch('/api/system/stats', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

const services = await fetch('/api/services', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// ✅ Đúng — Tạo một wrapper dùng chung (frontend/js/api.js)
export async function apiFetch(path, options = {}) {
    const response = await fetch(`/api${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...options.headers,
        },
    });
    if (!response.ok) throw new Error(`API Error ${response.status}: ${path}`);
    return response.json();
}
```

---

## 5. Comment — Giải thích TẠI SAO, không phải CÁI GÌ

```python
# ❌ Sai — comment giải thích code làm gì (đã rõ rồi)
# Chia cho 1000 để đổi sang °C
return int(raw) / 1000

# ✅ Đúng — comment giải thích tại sao
# Linux kernel báo nhiệt độ theo milli-Celsius, phải chia 1000 để ra °C
return int(raw) / 1000

# ✅ Đúng — comment giải thích lý do chọn giải pháp
# Dùng interval=0.1 thay vì 0 vì interval=0 chỉ so sánh với lần gọi trước,
# không phản ánh CPU hiện tại nếu gọi quá nhanh liên tiếp
return psutil.cpu_percent(interval=0.1)
```

---

## Definition of Done — Checklist trước khi commit

- [ ] Hàm mới có docstring ngắn (Python) hoặc JSDoc comment (JS)
- [ ] Mọi I/O operation có try-except / try-catch
- [ ] Không có biến tên 1-2 ký tự không rõ nghĩa
- [ ] Không có đoạn code nào bị comment out và bỏ đó
- [ ] Đã test thủ công ít nhất 1 happy path + 1 error path
