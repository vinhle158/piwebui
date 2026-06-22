---
name: project-architecture
description: Quyết định kiến trúc dứt khoát cho dự án Pi WebUI. Đây là nguồn sự thật duy nhất (single source of truth) về tech stack và cấu trúc dự án.
---

# Kiến trúc Dự án Pi WebUI — Quyết định Dứt khoát

## Tech Stack — ĐÃ CHỐT, KHÔNG THAY ĐỔI

| Thành phần | Công nghệ | Lý do |
|------------|-----------|-------|
| Backend | **Python 3.11+ / FastAPI** | Native Pi ecosystem, GPIO, psutil, async WebSocket |
| Frontend | **Vanilla HTML + CSS + JS (ES Modules)** | Offline-first, không build step, nhẹ nhất |
| Database | **SQLite 3 (WAL mode)** | Built-in Python, zero daemon, an toàn mất điện |
| Real-time | **SSE** (monitoring) + **WebSocket** (interactive) | Tối ưu cho từng usecase |
| VPN/Access | **WireGuard + DuckDNS** | Self-hosted, không cloud trung gian |
| Process Mgr | **systemd** | Native Linux, tự restart khi crash |

## Cấu trúc Thư mục Chuẩn

```
piwebui/
├── backend/
│   ├── main.py              # FastAPI app, CORS, lifespan events
│   ├── config.py            # Settings từ .env (pydantic-settings)
│   ├── routers/
│   │   ├── system.py        # CPU, RAM, Temp, Disk endpoints
│   │   ├── services.py      # systemctl start/stop/status
│   │   ├── network.py       # IP, interfaces, WireGuard status
│   │   ├── files.py         # File manager API
│   │   └── terminal.py      # WebSocket terminal (xterm.js)
│   ├── services/
│   │   ├── system_info.py   # Đọc /proc/, /sys/, psutil
│   │   ├── process_mgr.py   # subprocess.run wrapper
│   │   └── file_ops.py      # File read/write/delete
│   ├── db/
│   │   ├── database.py      # SQLite connection, WAL setup
│   │   └── models.py        # SQLAlchemy / raw SQL schemas
│   ├── models/
│   │   └── schemas.py       # Pydantic request/response models
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── main.css         # Design tokens, reset, layout
│   │   ├── components.css   # Cards, buttons, badges
│   │   └── animations.css   # Keyframes, transitions
│   ├── js/
│   │   ├── app.js           # Router, init, state management
│   │   ├── api.js           # fetch() wrapper với auth header
│   │   ├── sse.js           # EventSource wrapper
│   │   ├── ws.js            # WebSocket manager
│   │   └── components/
│   │       ├── dashboard.js
│   │       ├── services.js
│   │       ├── terminal.js
│   │       └── files.js
│   └── assets/
│       ├── fonts/           # Inter font files (offline)
│       └── icons/           # Lucide icons SVG bundle
├── systemd/
│   └── piwebui.service
├── scripts/
│   ├── install.sh
│   └── setup_wireguard.sh
└── .env.example
```

## Quy tắc Bất biến

1. **Mọi dependency ngoài** (font, icon, lib) phải được tải về và lưu trong `frontend/assets/`. TUYỆT ĐỐI không dùng CDN.
2. **Backend KHÔNG chạy root**. Dùng user `pi` với sudoers config tối thiểu.
3. **SQLite phải bật WAL mode** ngay khi khởi tạo connection.
4. **Mọi subprocess call** phải dùng `list` argument, không dùng `shell=True`.
5. **Frontend nhận data qua SSE/WebSocket**, không polling vòng lặp setInterval cho monitoring.

## Ví dụ FastAPI app entry chuẩn

```python
# backend/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import system, services, network, files, terminal
from .db.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # Khởi tạo DB + bật WAL mode
    yield

app = FastAPI(title="Pi WebUI", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])
app.include_router(system.router, prefix="/api/system")
app.include_router(services.router, prefix="/api/services")
app.include_router(network.router, prefix="/api/network")
app.include_router(files.router, prefix="/api/files")
app.include_router(terminal.router, prefix="/ws")

# Serve frontend tĩnh
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
```
