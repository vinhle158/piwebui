# Pi WebUI — Tài liệu Kiến trúc & Kế hoạch Triển khai

> **Mục đích tài liệu này:** Cung cấp đủ ngữ cảnh để AI sinh code mà không cần hỏi lại bất kỳ điều gì.
> Đọc toàn bộ trước khi bắt đầu viết bất kỳ dòng code nào.

---

## 1. Tổng quan Dự án

**Pi WebUI** là một ứng dụng web tự-host chạy trên Raspberry Pi, cho phép người dùng điều khiển và giám sát Pi hoàn toàn qua trình duyệt web — bao gồm cả khi đang ở ngoài nhà.

### Bối cảnh triển khai
- Pi đặt cố định ở nhà, cắm điện và cắm mạng LAN 24/7
- Người dùng truy cập từ điện thoại (có 4G) qua WireGuard VPN tunnel — không cần cloud trung gian
- Giao diện phải offline-ready: không phụ thuộc CDN, font/icon lưu local trên Pi

### Yêu cầu phi chức năng
- **Nhẹ:** Backend dùng tối đa 256MB RAM
- **Bền:** Không ghi log liên tục xuống SD card, SQLite WAL mode
- **An toàn:** Backend không chạy root, subprocess dùng whitelist
- **Nhanh:** Trang đầu load < 2 giây qua VPN

---

## 2. Tech Stack — ĐÃ CHỐT, KHÔNG THAY ĐỔI

| Layer | Công nghệ | Ghi chú |
|-------|-----------|---------|
| **Backend Runtime** | Python 3.11+ | Có sẵn trên Pi OS |
| **Backend Framework** | FastAPI + Uvicorn | Async, WebSocket built-in |
| **Frontend** | Vanilla HTML5 + CSS3 + JavaScript (ES Modules) | Không build step, không bundler |
| **Database** | SQLite 3 | WAL mode, built-in Python |
| **Real-time push** | SSE — Server-Sent Events | Monitoring dashboard |
| **Real-time 2 chiều** | WebSocket | Terminal, file upload |
| **VPN** | WireGuard | Self-hosted, không cloud |
| **DDNS** | DuckDNS | Resolve IP động nhà |
| **Process Manager** | systemd | Tự restart khi crash |

### `backend/requirements.txt` — Đúng các package này, không thêm bớt

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
psutil==6.1.0
pydantic-settings==2.6.0
aiofiles==24.1.0
python-multipart==0.0.18
```

---

## 3. Cấu trúc Thư mục — Đầy đủ

```
piwebui/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── system.py
│   │   ├── services.py
│   │   ├── network.py
│   │   ├── files.py
│   │   └── terminal.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── system_info.py
│   │   ├── process_mgr.py
│   │   └── file_ops.py
│   ├── db/
│   │   ├── __init__.py
│   │   └── database.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── main.css
│   │   ├── components.css
│   │   └── animations.css
│   ├── js/
│   │   ├── app.js
│   │   ├── api.js
│   │   ├── sse.js
│   │   ├── utils.js
│   │   └── components/
│   │       ├── dashboard.js
│   │       ├── services.js
│   │       ├── terminal.js
│   │       ├── files.js
│   │       └── network.js
│   └── assets/
│       ├── fonts/
│       │   ├── inter.css           # @font-face declarations
│       │   ├── Inter-Regular.woff2
│       │   ├── Inter-Medium.woff2
│       │   ├── Inter-SemiBold.woff2
│       │   └── Inter-Bold.woff2
│       ├── icons/
│       │   └── icons.svg           # Lucide icons SVG sprite
│       └── xterm/
│           ├── xterm.js            # xterm.js bundle (local)
│           ├── xterm.css
│           └── xterm-addon-fit.js
│
├── systemd/
│   └── piwebui.service
├── scripts/
│   └── install.sh
├── .env.example
└── README.md
```

---

## 4. Backend — Code Mẫu Đầy đủ Từng File

### `backend/config.py`

```python
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8080
    db_path: Path = Path("/var/lib/piwebui/data.db")
    allowed_services: list[str] = [
        "piwebui", "nginx", "ssh", "bluetooth",
        "hostapd", "cron", "networking", "wg-quick@wg0"
    ]
    file_manager_root: Path = Path("/home/pi")
    file_manager_restricted: list[str] = ["/etc/shadow", "/etc/sudoers"]

    class Config:
        env_file = ".env"

settings = Settings()
```

---

### `backend/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import system, services, network, files, terminal
from .db.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Pi WebUI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router,   prefix="/api/system",   tags=["System"])
app.include_router(services.router, prefix="/api/services", tags=["Services"])
app.include_router(network.router,  prefix="/api/network",  tags=["Network"])
app.include_router(files.router,    prefix="/api/files",    tags=["Files"])
app.include_router(terminal.router, prefix="/ws",           tags=["Terminal"])

# Mount frontend SAU các API routes
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
```

---

### `backend/models/schemas.py`

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CpuStats(BaseModel):
    percent: float = Field(ge=0, le=100)
    freq_mhz: Optional[float] = None
    core_count: int

class RamStats(BaseModel):
    total_bytes: int
    used_bytes: int
    percent: float = Field(ge=0, le=100)

class DiskStats(BaseModel):
    total_bytes: int
    used_bytes: int
    percent: float = Field(ge=0, le=100)
    mount_point: str

class SystemStatsResponse(BaseModel):
    cpu: CpuStats
    ram: RamStats
    disk: DiskStats
    cpu_temp_celsius: Optional[float] = None
    uptime_seconds: int
    load_avg: list[float]        # [1min, 5min, 15min]
    alert_level: str             # "ok" | "warning" | "danger"
    timestamp: datetime

class ServiceInfo(BaseModel):
    name: str
    display_name: str
    active: bool
    enabled: bool
    status: str                  # "active" | "inactive" | "failed"
    description: Optional[str] = None

class ServiceListResponse(BaseModel):
    services: list[ServiceInfo]

class ServiceActionResponse(BaseModel):
    success: bool
    message: str

class FileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size_bytes: Optional[int] = None
    modified_at: Optional[datetime] = None
    permissions: str

class FileListResponse(BaseModel):
    path: str
    parent: Optional[str] = None
    entries: list[FileEntry]

class FileContentResponse(BaseModel):
    path: str
    content: str

class FileWriteRequest(BaseModel):
    path: str
    content: str

class NetworkInterface(BaseModel):
    name: str
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    is_up: bool
    speed_mbps: Optional[int] = None

class NetworkStatsResponse(BaseModel):
    interfaces: list[NetworkInterface]
    wireguard_active: bool
    wireguard_peers: int
```

---

### `backend/db/database.py`

```python
import sqlite3
import threading
from pathlib import Path
from ..config import settings

_local = threading.local()

def get_connection() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(
            str(settings.db_path), check_same_thread=False
        )
        _local.conn.row_factory = sqlite3.Row
        _apply_pragmas(_local.conn)
    return _local.conn

def _apply_pragmas(conn: sqlite3.Connection):
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-4000")
    conn.execute("PRAGMA busy_timeout=5000")

def init_db():
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(settings.db_path))
    _apply_pragmas(conn)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type   TEXT    NOT NULL,
            description  TEXT    NOT NULL DEFAULT '',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings_kv (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at DESC);
    """)
    conn.commit()
    conn.close()
```

---

### `backend/services/system_info.py`

```python
import psutil
from pathlib import Path
from datetime import datetime, timezone
from ..models.schemas import SystemStatsResponse, CpuStats, RamStats, DiskStats

TEMP_WARN, TEMP_CRIT = 65.0, 80.0
RAM_WARN,  RAM_CRIT  = 75.0, 90.0
DISK_WARN, DISK_CRIT = 80.0, 90.0

def get_cpu_temperature() -> float | None:
    try:
        raw = Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()
        return int(raw) / 1000.0
    except Exception:
        return None

def _alert_level(temp, ram_pct, disk_pct) -> str:
    t = temp or 0
    if t >= TEMP_CRIT  or ram_pct >= RAM_CRIT  or disk_pct >= DISK_CRIT:  return "danger"
    if t >= TEMP_WARN  or ram_pct >= RAM_WARN  or disk_pct >= DISK_WARN:  return "warning"
    return "ok"

def get_system_stats() -> SystemStatsResponse:
    mem  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    freq = psutil.cpu_freq()
    temp = get_cpu_temperature()
    return SystemStatsResponse(
        cpu=CpuStats(
            percent=psutil.cpu_percent(interval=0.1),
            freq_mhz=freq.current if freq else None,
            core_count=psutil.cpu_count(logical=True) or 4,
        ),
        ram=RamStats(total_bytes=mem.total, used_bytes=mem.used, percent=mem.percent),
        disk=DiskStats(total_bytes=disk.total, used_bytes=disk.used,
                       percent=disk.percent, mount_point="/"),
        cpu_temp_celsius=temp,
        uptime_seconds=int(
            datetime.now(timezone.utc).timestamp() - psutil.boot_time()
        ),
        load_avg=list(psutil.getloadavg()),
        alert_level=_alert_level(temp, mem.percent, disk.percent),
        timestamp=datetime.now(timezone.utc),
    )
```

---

### `backend/services/process_mgr.py`

```python
import asyncio, logging
from ..config import settings

logger = logging.getLogger(__name__)

async def run_command(args: list[str], timeout: int = 10) -> tuple[int, str, str]:
    """Chạy subprocess an toàn. KHÔNG shell=True."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "timeout"

async def get_service_status(name: str) -> dict | None:
    if name not in settings.allowed_services:
        return None
    _, active_out, _   = await run_command(["systemctl", "is-active",  name])
    _, enabled_out, _  = await run_command(["systemctl", "is-enabled", name])
    _, desc_out, _     = await run_command(
        ["systemctl", "show", name, "--property=Description", "--value"]
    )
    return {
        "name":        name,
        "display_name": name,
        "active":      active_out.strip()  == "active",
        "enabled":     enabled_out.strip() == "enabled",
        "status":      active_out.strip(),
        "description": desc_out.strip() or None,
    }

async def control_service(name: str, action: str) -> bool:
    if name not in settings.allowed_services:
        return False
    if action not in {"start", "stop", "restart"}:
        return False
    code, _, stderr = await run_command(["sudo", "systemctl", action, name])
    if code != 0:
        logger.error(f"systemctl {action} {name}: {stderr}")
    return code == 0
```

---

### `backend/services/file_ops.py`

```python
import os, aiofiles, tempfile, shutil
from pathlib import Path
from datetime import datetime
from ..config import settings

def _safe(path: Path) -> bool:
    try:
        path.resolve().relative_to(settings.file_manager_root.resolve())
        return str(path.resolve()) not in settings.file_manager_restricted
    except ValueError:
        return False

def list_directory(path: str) -> dict:
    target = Path(path)
    if not _safe(target) or not target.is_dir():
        raise PermissionError(f"Không được phép: {path}")
    entries = []
    for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        try:
            st = item.stat()
            entries.append({
                "name": item.name, "path": str(item), "is_dir": item.is_dir(),
                "size_bytes": st.st_size if item.is_file() else None,
                "modified_at": datetime.fromtimestamp(st.st_mtime),
                "permissions": oct(st.st_mode)[-3:],
            })
        except (OSError, PermissionError):
            pass
    return {
        "path": str(target),
        "parent": str(target.parent) if str(target) != str(settings.file_manager_root) else None,
        "entries": entries,
    }

async def read_file(path: str) -> str:
    target = Path(path)
    if not _safe(target) or not target.is_file():
        raise PermissionError(f"Không được phép: {path}")
    async with aiofiles.open(target, "r", encoding="utf-8", errors="replace") as f:
        return await f.read()

async def write_file(path: str, content: str) -> None:
    target = Path(path)
    if not _safe(target):
        raise PermissionError(f"Không được phép: {path}")
    with tempfile.NamedTemporaryFile(
        mode="w", dir=target.parent, delete=False, suffix=".tmp", encoding="utf-8"
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    os.replace(tmp_path, target)  # atomic
```

---

### `backend/routers/system.py`

```python
import asyncio, json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..services.system_info import get_system_stats
from ..services.process_mgr import run_command
from ..models.schemas import SystemStatsResponse

router = APIRouter()

@router.get("/stats", response_model=SystemStatsResponse)
async def stats():
    return get_system_stats()

@router.get("/stream")
async def stream():
    async def gen():
        while True:
            try:
                data = get_system_stats().model_dump_json()
                yield f"data: {data}\n\n"
            except Exception:
                yield "data: {}\n\n"
            await asyncio.sleep(2)
    return StreamingResponse(gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@router.post("/reboot")
async def reboot():
    await run_command(["sudo", "shutdown", "-r", "+0"])
    return {"message": "Đang khởi động lại..."}

@router.post("/shutdown")
async def shutdown():
    await run_command(["sudo", "shutdown", "-h", "now"])
    return {"message": "Đang tắt..."}
```

---

### `backend/routers/services.py`

```python
import asyncio
from fastapi import APIRouter, HTTPException
from ..services.process_mgr import get_service_status, control_service
from ..config import settings
from ..models.schemas import ServiceInfo, ServiceListResponse, ServiceActionResponse

router = APIRouter()

@router.get("", response_model=ServiceListResponse)
async def list_services():
    results = await asyncio.gather(
        *[get_service_status(n) for n in settings.allowed_services]
    )
    svcs = [ServiceInfo(**s) for s in results if s]
    return ServiceListResponse(services=svcs)

@router.get("/{name}", response_model=ServiceInfo)
async def get_service(name: str):
    s = await get_service_status(name)
    if not s:
        raise HTTPException(404, detail=f"Service '{name}' không tìm thấy")
    return ServiceInfo(**s)

@router.post("/{name}/{action}", response_model=ServiceActionResponse)
async def service_action(name: str, action: str):
    if action not in {"start", "stop", "restart"}:
        raise HTTPException(400, detail=f"Action không hợp lệ: {action}")
    ok = await control_service(name, action)
    if not ok:
        raise HTTPException(500, detail=f"Không thể {action} '{name}'")
    return ServiceActionResponse(success=True, message=f"'{name}' đã {action}")
```

---

### `backend/routers/files.py`

```python
from fastapi import APIRouter, HTTPException, UploadFile
from pathlib import Path
import aiofiles
from ..services.file_ops import list_directory, read_file, write_file, _safe
from ..models.schemas import FileListResponse, FileContentResponse, FileWriteRequest
from ..config import settings

router = APIRouter()

@router.get("", response_model=FileListResponse)
async def list_files(path: str = None):
    try:
        return FileListResponse(**list_directory(path or str(settings.file_manager_root)))
    except PermissionError as e:
        raise HTTPException(403, str(e))

@router.get("/content", response_model=FileContentResponse)
async def get_content(path: str):
    try:
        content = await read_file(path)
        return FileContentResponse(path=path, content=content)
    except PermissionError as e:
        raise HTTPException(403, str(e))

@router.put("/content")
async def save_content(req: FileWriteRequest):
    try:
        await write_file(req.path, req.content)
        return {"message": "Đã lưu"}
    except PermissionError as e:
        raise HTTPException(403, str(e))

@router.post("/upload")
async def upload(file: UploadFile, path: str):
    target = Path(path) / file.filename
    if not _safe(target):
        raise HTTPException(403, "Không được phép upload vào đây")
    async with aiofiles.open(target, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
    return {"message": f"Đã upload: {file.filename}"}

@router.delete("")
async def delete(path: str):
    import shutil
    target = Path(path)
    if not _safe(target):
        raise HTTPException(403, "Không được phép xóa")
    shutil.rmtree(target) if target.is_dir() else target.unlink()
    return {"message": f"Đã xóa: {path}"}
```

---

### `backend/routers/network.py`

```python
import psutil
from fastapi import APIRouter
from ..services.process_mgr import run_command
from ..models.schemas import NetworkStatsResponse, NetworkInterface

router = APIRouter()

@router.get("", response_model=NetworkStatsResponse)
async def get_network():
    addrs  = psutil.net_if_addrs()
    stats  = psutil.net_if_stats()
    ifaces = []
    for name, addr_list in addrs.items():
        ipv4 = next((a.address for a in addr_list if a.family.name == "AF_INET"), None)
        mac  = next((a.address for a in addr_list if a.family.name == "AF_PACKET"), None)
        st   = stats.get(name)
        ifaces.append(NetworkInterface(
            name=name, ip_address=ipv4, mac_address=mac,
            is_up=st.isup if st else False,
            speed_mbps=st.speed if st else None,
        ))

    code, wg_out, _ = await run_command(["sudo", "wg", "show"])
    wg_active = (code == 0 and "interface:" in wg_out)
    return NetworkStatsResponse(
        interfaces=ifaces,
        wireguard_active=wg_active,
        wireguard_peers=wg_out.count("peer:") if wg_active else 0,
    )
```

---

### `backend/routers/terminal.py`

```python
import asyncio, os, pty
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

@router.websocket("/terminal")
async def terminal_ws(ws: WebSocket):
    await ws.accept()
    master_fd, slave_fd = pty.openpty()
    pid = os.fork()
    if pid == 0:
        os.setsid()
        for fd in (0, 1, 2): os.dup2(slave_fd, fd)
        os.close(master_fd)
        os.execvp("bash", ["bash", "--login"])
    else:
        os.close(slave_fd)
        loop = asyncio.get_event_loop()
        try:
            async def rd():
                while True:
                    data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                    await ws.send_bytes(data)
            async def wr():
                while True:
                    data = await ws.receive_bytes()
                    os.write(master_fd, data)
            await asyncio.gather(rd(), wr())
        except (WebSocketDisconnect, OSError):
            pass
        finally:
            try: os.kill(pid, 9); os.waitpid(pid, 0); os.close(master_fd)
            except: pass
```

---

## 5. API Endpoints — Bảng Đầy đủ

| Method | Path | Mô tả | Response Type |
|--------|------|--------|--------------|
| GET | `/api/system/stats` | Snapshot stats hệ thống | `SystemStatsResponse` |
| GET | `/api/system/stream` | SSE stream stats (mỗi 2s) | `text/event-stream` |
| POST | `/api/system/reboot` | Khởi động lại Pi | `{message}` |
| POST | `/api/system/shutdown` | Tắt Pi | `{message}` |
| GET | `/api/services` | Danh sách + trạng thái tất cả service | `ServiceListResponse` |
| GET | `/api/services/{name}` | Chi tiết 1 service | `ServiceInfo` |
| POST | `/api/services/{name}/start` | Bật service | `ServiceActionResponse` |
| POST | `/api/services/{name}/stop` | Tắt service | `ServiceActionResponse` |
| POST | `/api/services/{name}/restart` | Restart service | `ServiceActionResponse` |
| GET | `/api/files?path=/home/pi` | List thư mục (default: `/home/pi`) | `FileListResponse` |
| GET | `/api/files/content?path=...` | Đọc nội dung text file | `FileContentResponse` |
| PUT | `/api/files/content` | Ghi nội dung file (body: `FileWriteRequest`) | `{message}` |
| POST | `/api/files/upload?path=...` | Upload file | `{message}` |
| DELETE | `/api/files?path=...` | Xóa file hoặc thư mục | `{message}` |
| GET | `/api/network` | Thông tin interfaces + WireGuard | `NetworkStatsResponse` |
| WS | `/ws/terminal` | WebSocket terminal (PTY bash) | binary frames |

---

## 6. Frontend — Thiết kế Chi tiết

### 6.1 Design System — CSS Variables

```css
/* frontend/css/main.css — khai báo ở :root */
:root {
    /* Background layers */
    --bg-base:       hsl(222, 20%, 9%);
    --bg-surface:    hsl(222, 18%, 13%);
    --bg-elevated:   hsl(222, 16%, 18%);
    --bg-hover:      hsl(222, 15%, 22%);
    --border-color:  hsl(222, 15%, 25%);

    /* Brand colors */
    --primary:       hsl(210, 100%, 60%);
    --primary-hover: hsl(210, 100%, 70%);
    --primary-dim:   hsl(210, 100%, 60%, 0.15);
    --success:       hsl(142, 70%, 50%);
    --success-dim:   hsl(142, 70%, 50%, 0.15);
    --warning:       hsl(38, 95%, 55%);
    --warning-dim:   hsl(38, 95%, 55%, 0.15);
    --danger:        hsl(0, 78%, 63%);
    --danger-dim:    hsl(0, 78%, 63%, 0.15);

    /* Text */
    --text-primary:   hsl(210, 20%, 95%);
    --text-secondary: hsl(210, 15%, 65%);
    --text-muted:     hsl(210, 10%, 45%);

    /* Typography */
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

    /* Spacing (8px grid) */
    --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
    --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

    /* Radius */
    --r-sm: 6px; --r-md: 10px; --r-lg: 16px; --r-xl: 20px;

    /* Shadows */
    --shadow-sm: 0 1px 3px hsl(0 0% 0% / 0.3);
    --shadow-md: 0 4px 16px hsl(0 0% 0% / 0.4);
    --shadow-lg: 0 8px 32px hsl(0 0% 0% / 0.5);

    /* Transitions */
    --transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 6.2 Layout HTML Cấu trúc

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi WebUI</title>
    <link rel="stylesheet" href="css/main.css">
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/animations.css">
    <link rel="stylesheet" href="assets/fonts/inter.css">
</head>
<body>
    <div id="app">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar__brand">
                <svg class="brand-icon">...</svg>
                <span class="brand-name">Pi WebUI</span>
            </div>
            <nav class="sidebar__nav">
                <a class="nav-item active" data-route="#dashboard" href="#dashboard">
                    <svg class="nav-icon"><!-- dashboard icon --></svg>
                    <span>Dashboard</span>
                </a>
                <a class="nav-item" data-route="#services" href="#services">
                    <svg class="nav-icon"><!-- services icon --></svg>
                    <span>Services</span>
                </a>
                <a class="nav-item" data-route="#files" href="#files">
                    <svg class="nav-icon"><!-- folder icon --></svg>
                    <span>Files</span>
                </a>
                <a class="nav-item" data-route="#terminal" href="#terminal">
                    <svg class="nav-icon"><!-- terminal icon --></svg>
                    <span>Terminal</span>
                </a>
                <a class="nav-item" data-route="#network" href="#network">
                    <svg class="nav-icon"><!-- network icon --></svg>
                    <span>Network</span>
                </a>
            </nav>
            <!-- Mini system status ở cuối sidebar -->
            <div class="sidebar__footer" id="sidebar-stats">
                <div class="mini-stat">
                    <span class="mini-stat__label">CPU</span>
                    <span class="mini-stat__value" id="sb-cpu">—</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat__label">RAM</span>
                    <span class="mini-stat__value" id="sb-ram">—</span>
                </div>
                <div class="mini-stat">
                    <span class="mini-stat__label">Temp</span>
                    <span class="mini-stat__value" id="sb-temp">—</span>
                </div>
            </div>
        </aside>

        <!-- Main content -->
        <main class="main-content" id="main-content" role="main">
            <!-- JS sẽ render nội dung vào đây -->
        </main>
    </div>

    <!-- Toast container -->
    <div id="toast-container" aria-live="polite"></div>

    <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

### 6.3 Trang Dashboard — Mô tả chi tiết

**Cấu trúc grid:**
- Row 1: 4 stat cards (CPU, RAM, Temp, Disk) — `grid-template-columns: repeat(4, 1fr)`
- Row 2: 2 widgets (System Info + Quick Actions) — `grid-template-columns: 1fr 1fr`
- Row 3: Activity Feed — full width

**Stat Card HTML pattern:**
```html
<div class="stat-card" id="card-cpu">
    <div class="stat-card__header">
        <svg class="stat-card__icon"><!-- cpu icon --></svg>
        <span class="stat-card__label">CPU Usage</span>
    </div>
    <div class="stat-card__value" id="cpu-value">0%</div>
    <div class="stat-card__bar">
        <div class="progress-bar" id="cpu-bar" style="--progress: 0%"></div>
    </div>
    <div class="stat-card__sub" id="cpu-sub">4 cores · — MHz</div>
</div>
```

**Progress bar CSS** — màu thay đổi theo giá trị:
```css
.progress-bar {
    width: var(--progress, 0%);
    background: var(--primary);  /* default */
    transition: width 800ms ease, background var(--transition);
}
/* JS sẽ thêm class khi update */
.progress-bar.warn { background: var(--warning); }
.progress-bar.danger { background: var(--danger); }
```

**Quick Actions modal:**
- Nút Restart: màu warning, hỏi "Bạn chắc chắn muốn restart Pi?"
- Nút Shutdown: màu danger, hỏi "Bạn chắc chắn muốn TẮT Pi?"
- Custom confirm modal (KHÔNG dùng `window.confirm()`)

**Dashboard JS logic:**
```javascript
// components/dashboard.js
import { SSEClient } from '../sse.js';
import { api } from '../api.js';
import { formatBytes, formatUptime, showToast, showConfirm } from '../utils.js';

export function initDashboard(container) {
    container.innerHTML = getDashboardHTML();

    // SSE cho stats real-time
    const sse = new SSEClient('/api/system/stream', updateStats, updateConnectionStatus);
    sse.connect();

    // Quick action buttons
    document.getElementById('btn-reboot')?.addEventListener('click', async () => {
        if (await showConfirm('Bạn chắc chắn muốn khởi động lại Pi?')) {
            try { await api.post('/system/reboot'); showToast('Đang khởi động lại...', 'warning'); }
            catch (e) { showToast(e.message, 'error'); }
        }
    });
    document.getElementById('btn-shutdown')?.addEventListener('click', async () => {
        if (await showConfirm('Bạn chắc chắn muốn TẮT Pi? Phải bật tay lại.')) {
            try { await api.post('/system/shutdown'); showToast('Đang tắt...', 'danger'); }
            catch (e) { showToast(e.message, 'error'); }
        }
    });

    // Cleanup function — gọi khi rời trang
    return () => sse.disconnect();
}

function updateStats(stats) {
    // CPU
    setProgressBar('cpu-bar', stats.cpu.percent);
    setText('cpu-value', `${stats.cpu.percent.toFixed(1)}%`);
    setText('cpu-sub', `${stats.cpu.core_count} cores · ${stats.cpu.freq_mhz ? Math.round(stats.cpu.freq_mhz) + ' MHz' : '—'}`);
    // RAM
    setProgressBar('ram-bar', stats.ram.percent);
    setText('ram-value', `${stats.ram.percent.toFixed(1)}%`);
    setText('ram-sub', `${formatBytes(stats.ram.used_bytes)} / ${formatBytes(stats.ram.total_bytes)}`);
    // Temp
    if (stats.cpu_temp_celsius !== null) {
        setText('temp-value', `${stats.cpu_temp_celsius.toFixed(1)}°C`);
    }
    // Disk
    setProgressBar('disk-bar', stats.disk.percent);
    setText('disk-value', `${stats.disk.percent.toFixed(1)}%`);
    setText('disk-sub', `${formatBytes(stats.disk.used_bytes)} / ${formatBytes(stats.disk.total_bytes)}`);
    // Uptime
    setText('uptime-value', formatUptime(stats.uptime_seconds));
    // Load avg
    setText('load-value', stats.load_avg.map(n => n.toFixed(2)).join(' · '));
    // Alert level — thêm class cho body để pulse
    document.getElementById('app').dataset.alertLevel = stats.alert_level;

    // Cập nhật sidebar mini stats
    setText('sb-cpu', `${Math.round(stats.cpu.percent)}%`);
    setText('sb-ram', `${Math.round(stats.ram.percent)}%`);
    setText('sb-temp', stats.cpu_temp_celsius ? `${stats.cpu_temp_celsius.toFixed(0)}°` : '—');
}

function setProgressBar(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('--progress', `${value}%`);
    el.className = 'progress-bar' + (value >= 90 ? ' danger' : value >= 75 ? ' warn' : '');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
```

---

### 6.4 Trang Services — Mô tả

**JS logic:**
```javascript
// components/services.js
import { api } from '../api.js';
import { showToast } from '../utils.js';

export function initServices(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1>Services</h1>
            <button class="btn btn--sm btn--secondary" id="btn-refresh-services">
                ↻ Làm mới
            </button>
        </div>
        <div class="service-list" id="service-list">
            <!-- Skeleton loading -->
            ${Array(4).fill('<div class="service-card skeleton" style="height:80px"></div>').join('')}
        </div>`;

    loadServices();
    document.getElementById('btn-refresh-services')?.addEventListener('click', loadServices);
}

async function loadServices() {
    const list = document.getElementById('service-list');
    try {
        const data = await api.get('/services');
        list.innerHTML = data.services.map(s => renderServiceCard(s)).join('');
        // Bind events
        list.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => handleServiceAction(
                btn.dataset.service, btn.dataset.action, btn
            ));
        });
    } catch (e) {
        showToast(`Lỗi tải services: ${e.message}`, 'error');
    }
}

function renderServiceCard(service) {
    const statusClass = service.active ? 'active' : (service.status === 'failed' ? 'failed' : 'inactive');
    return `
        <div class="service-card" id="svc-${service.name}">
            <div class="service-card__info">
                <span class="status-dot status-dot--${statusClass}"></span>
                <div>
                    <div class="service-card__name">${service.name}</div>
                    <div class="service-card__desc">${service.description || service.status}</div>
                </div>
                <span class="badge badge--${statusClass}">${service.status}</span>
            </div>
            <div class="service-card__actions">
                <button class="btn btn--sm btn--success" data-service="${service.name}" data-action="start" ${service.active ? 'disabled' : ''}>Start</button>
                <button class="btn btn--sm btn--danger"  data-service="${service.name}" data-action="stop"  ${!service.active ? 'disabled' : ''}>Stop</button>
                <button class="btn btn--sm btn--primary" data-service="${service.name}" data-action="restart">Restart</button>
            </div>
        </div>`;
}

async function handleServiceAction(name, action, btn) {
    const card = document.getElementById(`svc-${name}`);
    card.classList.add('loading');
    btn.disabled = true;
    try {
        await api.post(`/services/${name}/${action}`);
        showToast(`${action} '${name}' thành công`, 'success');
        await loadServices();  // Reload để cập nhật status
    } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'error');
        card.classList.remove('loading');
    }
}
```

---

### 6.5 Trang Terminal — Mô tả

```javascript
// components/terminal.js
// Dùng xterm.js bundle local tại assets/xterm/

export function initTerminal(container) {
    container.innerHTML = `
        <div class="page-header">
            <h1>Terminal</h1>
            <span class="connection-badge" id="term-status">Đang kết nối...</span>
        </div>
        <div class="terminal-wrapper" id="terminal-wrapper"></div>`;

    // Load xterm.js dynamically (bundle local)
    const script = document.createElement('script');
    script.src = '/assets/xterm/xterm.js';
    script.onload = () => {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet'; cssLink.href = '/assets/xterm/xterm.css';
        document.head.appendChild(cssLink);
        initXterm();
    };
    document.head.appendChild(script);

    return () => { /* cleanup ws */ };
}

function initXterm() {
    const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#58a6ff',
        },
        cursorBlink: true,
        allowTransparency: false,
    });
    term.open(document.getElementById('terminal-wrapper'));

    const wsUrl = `ws://${location.host}/ws/terminal`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen    = () => setText('term-status', '● Đã kết nối', 'success');
    ws.onclose   = () => setText('term-status', '○ Mất kết nối', 'error');
    ws.onmessage = (e) => term.write(new Uint8Array(e.data));
    term.onData  = (data) => ws.send(new TextEncoder().encode(data));
}
```

---

## 7. CSS Components Pattern

### Card (Glassmorphism)
```css
.card {
    background: hsl(222 18% 13% / 0.85);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-color);
    border-radius: var(--r-lg);
    padding: var(--sp-6);
    box-shadow: var(--shadow-md);
    transition: transform var(--transition), box-shadow var(--transition);
}
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
```

### Button variants
```css
.btn {
    display: inline-flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-md); border: none; cursor: pointer;
    font-family: var(--font-sans); font-size: 14px; font-weight: 500;
    transition: all var(--transition);
}
.btn--primary  { background: var(--primary); color: #fff; }
.btn--primary:hover { background: var(--primary-hover); }
.btn--success  { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
.btn--danger   { background: var(--danger-dim);  color: var(--danger);  border: 1px solid var(--danger); }
.btn--secondary{ background: var(--bg-elevated); color: var(--text-secondary); }
.btn--sm { padding: var(--sp-1) var(--sp-3); font-size: 12px; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

### Toast notification
```css
#toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999;
    display: flex; flex-direction: column; gap: var(--sp-2); }
.toast {
    padding: var(--sp-3) var(--sp-4); border-radius: var(--r-md);
    font-size: 14px; font-weight: 500; max-width: 320px;
    opacity: 0; transform: translateX(20px);
    transition: all var(--transition); box-shadow: var(--shadow-md);
}
.toast--visible { opacity: 1; transform: translateX(0); }
.toast--success { background: var(--success-dim); color: var(--success); border: 1px solid var(--success); }
.toast--error   { background: var(--danger-dim);  color: var(--danger);  border: 1px solid var(--danger); }
.toast--warning { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning); }
```

### Status dot (animated)
```css
.status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.status-dot--active   { background: var(--success);
    animation: dot-pulse 2s ease-in-out infinite; }
.status-dot--inactive { background: var(--text-muted); }
.status-dot--failed   { background: var(--danger); }
```

---

## 8. Systemd Service File

```ini
# systemd/piwebui.service
[Unit]
Description=Pi WebUI — Raspberry Pi Control Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/piwebui/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/pi/piwebui/venv/bin/uvicorn main:app \
    --host 0.0.0.0 --port 8080 --workers 1 --log-level warning
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
MemoryMax=256M
MemorySwapMax=0
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

---

## 9. Sudoers Config

```
# /etc/sudoers.d/piwebui
# Tạo file này, KHÔNG sửa /etc/sudoers trực tiếp
pi ALL=(ALL) NOPASSWD: /bin/systemctl start *
pi ALL=(ALL) NOPASSWD: /bin/systemctl stop *
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart *
pi ALL=(ALL) NOPASSWD: /sbin/reboot
pi ALL=(ALL) NOPASSWD: /sbin/shutdown
pi ALL=(ALL) NOPASSWD: /usr/bin/wg show
```

---

## 10. Kế hoạch Triển khai — Thứ tự Bắt buộc

```
Phase 1 — Foundation (làm trước)
  ✦ backend/config.py
  ✦ backend/models/schemas.py
  ✦ backend/db/database.py
  ✦ backend/services/process_mgr.py
  ✦ backend/main.py (chưa mount router)
  → TEST: uvicorn khởi động, /docs accessible

Phase 2 — Dashboard (hữu dụng ngay)
  ✦ backend/services/system_info.py
  ✦ backend/routers/system.py
  ✦ frontend/css/ (3 files CSS)
  ✦ frontend/index.html
  ✦ frontend/js/api.js + sse.js + utils.js + app.js
  ✦ frontend/js/components/dashboard.js
  → TEST: Mở http://localhost:8080 thấy stats real-time

Phase 3 — Services Manager
  ✦ backend/routers/services.py
  ✦ frontend/js/components/services.js
  ✦ Cấu hình /etc/sudoers.d/piwebui
  → TEST: list/start/stop/restart service

Phase 4 — File Manager
  ✦ backend/services/file_ops.py
  ✦ backend/routers/files.py
  ✦ frontend/js/components/files.js
  → TEST: browse, đọc, ghi, upload, xóa

Phase 5 — Terminal
  ✦ Download xterm.js bundle → frontend/assets/xterm/
  ✦ backend/routers/terminal.py
  ✦ frontend/js/components/terminal.js
  → TEST: gõ lệnh, xem output

Phase 6 — Network + Polish
  ✦ backend/routers/network.py
  ✦ frontend/js/components/network.js
  ✦ Responsive CSS (breakpoints 768px, 1024px)
  ✦ systemd/piwebui.service
  ✦ scripts/install.sh
```

---

## 11. Quy tắc Code — Không được vi phạm

1. **Subprocess:** `["systemctl", "restart", "nginx"]` — KHÔNG `"systemctl restart nginx"` + `shell=True`
2. **Service access:** Luôn check `settings.allowed_services` trước khi thực thi
3. **File access:** Luôn qua `_safe(path)` trước khi đọc/ghi/xóa
4. **HTTP calls:** Luôn dùng `api.get/post/put/delete()` trong `api.js`
5. **Monitoring:** SSE — KHÔNG `setInterval` polling
6. **Assets:** Không reference CDN. Font, xterm.js phải ở `frontend/assets/`
7. **Dialog:** `showToast()` và `showConfirm()` từ `utils.js`. KHÔNG `alert()` hay `confirm()`
8. **Error:** Mọi `fetch`/`subprocess` phải có try-catch + log/toast lỗi

---

## 12. Lệnh Khởi động

```bash
# Cài môi trường (lần đầu)
cd /home/pi/piwebui/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Chạy development
uvicorn main:app --reload --host 0.0.0.0 --port 8080

# Truy cập
# Local: http://192.168.1.xxx:8080
# Qua VPN: http://10.8.0.1:8080
```
