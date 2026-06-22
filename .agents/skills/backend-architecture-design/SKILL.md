---
name: backend-architecture-design
description: Chuẩn xây dựng Backend FastAPI cho Pi WebUI — cấu trúc router/service/db, Pydantic schemas, subprocess an toàn, SQLite WAL.
---

# Backend Architecture — Python FastAPI

## Cấu trúc Phân lớp (Bắt buộc)

```
backend/
├── main.py           # App entry, middleware, mount routes
├── config.py         # Pydantic Settings từ .env
├── routers/          # Layer 1: HTTP/WS endpoints (KHÔNG chứa logic)
├── services/         # Layer 2: Business logic (KHÔNG biết về HTTP)
├── db/               # Layer 3: Dữ liệu (KHÔNG biết về HTTP hoặc business)
└── models/schemas.py # Pydantic request/response types
```

**Quy tắc tuyệt đối:** Router chỉ được gọi Service. Service chỉ được gọi DB/Services khác. KHÔNG skip layer.

---

## Pattern Router Chuẩn

```python
# backend/routers/services.py
from fastapi import APIRouter, HTTPException
from ..services.process_mgr import start_service, stop_service, get_service_status
from ..models.schemas import ServiceActionRequest, ServiceStatusResponse

router = APIRouter(tags=["services"])

@router.get("/{service_name}", response_model=ServiceStatusResponse)
async def get_status(service_name: str):
    """Lấy trạng thái của một systemd service."""
    # Validate input — chỉ cho phép tên service hợp lệ
    if not service_name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Tên service không hợp lệ")
    
    status = await get_service_status(service_name)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' không tìm thấy")
    return status

@router.post("/{service_name}/restart")
async def restart_service(service_name: str):
    """Khởi động lại một service."""
    if not service_name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Tên service không hợp lệ")
    
    success = await start_service(service_name, action="restart")
    if not success:
        raise HTTPException(status_code=500, detail="Không thể restart service")
    return {"message": f"Service '{service_name}' đã được restart"}
```

---

## Pattern Service Chuẩn — Subprocess An toàn

```python
# backend/services/process_mgr.py
import asyncio
import logging
from ..models.schemas import ServiceStatusResponse

logger = logging.getLogger(__name__)

# Whitelist các service được phép thao tác — bảo mật quan trọng
ALLOWED_SERVICES = frozenset({"piwebui", "nginx", "ssh", "bluetooth", "hostapd"})

async def run_command(args: list[str]) -> tuple[int, str, str]:
    """Chạy subprocess an toàn, trả về (returncode, stdout, stderr)."""
    # KHÔNG dùng shell=True — nguy cơ injection
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()

async def get_service_status(service_name: str) -> ServiceStatusResponse | None:
    if service_name not in ALLOWED_SERVICES:
        logger.warning(f"Từ chối truy vấn service không có trong whitelist: {service_name}")
        return None
    
    code, stdout, _ = await run_command(
        ["systemctl", "is-active", service_name]
    )
    return ServiceStatusResponse(
        name=service_name,
        active=(stdout.strip() == "active"),
        status=stdout.strip()
    )

async def start_service(service_name: str, action: str = "restart") -> bool:
    if service_name not in ALLOWED_SERVICES:
        return False
    if action not in {"start", "stop", "restart"}:
        return False
    
    # sudo đã được cấu hình trong /etc/sudoers.d/piwebui — KHÔNG cần password
    code, _, stderr = await run_command(
        ["sudo", "systemctl", action, service_name]
    )
    if code != 0:
        logger.error(f"systemctl {action} {service_name} thất bại: {stderr}")
    return code == 0
```

---

## Pattern Database — SQLite WAL

```python
# backend/db/database.py
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path("/var/lib/piwebui/data.db")  # Ngoài /tmp để persist
_local = threading.local()

def get_connection() -> sqlite3.Connection:
    """Thread-local connection — an toàn cho async FastAPI."""
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn

def init_db():
    """Gọi khi app khởi động. Bật WAL mode và tạo bảng."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    # WAL mode: an toàn khi mất điện, cho phép đọc đồng thời khi ghi
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")  # Cân bằng giữa an toàn và tốc độ
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
```

---

## Pydantic Schemas — Luôn khai báo type rõ ràng

```python
# backend/models/schemas.py
from pydantic import BaseModel, Field
from datetime import datetime

class ServiceStatusResponse(BaseModel):
    name: str
    active: bool
    status: str  # "active", "inactive", "failed", "unknown"

class SystemStatsResponse(BaseModel):
    cpu_percent: float = Field(ge=0, le=100)
    ram_percent: float = Field(ge=0, le=100)
    cpu_temp_celsius: float | None  # None nếu không đọc được
    disk_usage_percent: float = Field(ge=0, le=100)
    uptime_seconds: int
    timestamp: datetime
```

---

## HTTP Status Codes Chuẩn

| Tình huống | Code |
|------------|------|
| Thành công, có data trả về | `200 OK` |
| Thành công, không có data | `204 No Content` |
| Input từ client sai | `400 Bad Request` |
| Chưa xác thực | `401 Unauthorized` |
| Không có quyền | `403 Forbidden` |
| Không tìm thấy | `404 Not Found` |
| Lỗi server | `500 Internal Server Error` |
