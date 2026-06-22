---
name: realtime-communication
description: Chuẩn triển khai SSE và WebSocket cho Pi WebUI — dùng SSE để push monitoring data, WebSocket cho terminal và tương tác hai chiều.
---

# Real-time Communication — SSE + WebSocket

## Nguyên tắc Chọn kênh

| Kênh | Khi nào dùng | Ví dụ trong Pi WebUI |
|------|-------------|----------------------|
| **SSE** | Server push một chiều, liên tục | CPU%, RAM, Nhiệt độ, Disk I/O |
| **WebSocket** | Hai chiều, interactive | Web terminal, File upload progress |
| **REST/Fetch** | Tác vụ một lần, có kết quả | Restart service, Read file, Reboot |

---

## Pattern 1: SSE (Server-Sent Events)

### Backend — FastAPI SSE endpoint

```python
# backend/routers/system.py
import asyncio
import json
import psutil
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..services.system_info import get_stats

router = APIRouter()

async def stats_generator():
    """Generator phát stats mỗi 2 giây qua SSE."""
    while True:
        data = get_stats()  # CPU, RAM, Temp, Disk
        yield f"data: {json.dumps(data)}\n\n"
        await asyncio.sleep(2)

@router.get("/stream")
async def stream_stats():
    return StreamingResponse(
        stats_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Quan trọng nếu dùng nginx reverse proxy
        }
    )
```

### Frontend — SSE Client

```javascript
// frontend/js/sse.js
export class SSEClient {
    constructor(url, onMessage, onError) {
        this.url = url;
        this.onMessage = onMessage;
        this.onError = onError;
        this.es = null;
        this.reconnectDelay = 3000;
    }

    connect() {
        this.es = new EventSource(this.url);
        this.es.onmessage = (e) => this.onMessage(JSON.parse(e.data));
        this.es.onerror = () => {
            this.es.close();
            // Tự động reconnect sau 3 giây nếu Pi bị lag
            setTimeout(() => this.connect(), this.reconnectDelay);
        };
    }

    disconnect() {
        this.es?.close();
    }
}

// Sử dụng trong dashboard.js:
// const sse = new SSEClient('/api/system/stream', updateDashboard);
// sse.connect();
```

---

## Pattern 2: WebSocket (Web Terminal)

### Backend — FastAPI WebSocket endpoint

```python
# backend/routers/terminal.py
import asyncio
import pty, os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

@router.websocket("/terminal")
async def websocket_terminal(websocket: WebSocket):
    await websocket.accept()
    # Tạo PTY (pseudo-terminal) để chạy bash
    master_fd, slave_fd = pty.openpty()
    pid = os.fork()
    if pid == 0:
        # Child process: chạy bash
        os.setsid()
        os.dup2(slave_fd, 0); os.dup2(slave_fd, 1); os.dup2(slave_fd, 2)
        os.execvp("bash", ["bash"])
    else:
        # Parent: relay data giữa WebSocket và PTY
        try:
            async def read_pty():
                loop = asyncio.get_event_loop()
                while True:
                    data = await loop.run_in_executor(None, os.read, master_fd, 1024)
                    await websocket.send_bytes(data)

            async def write_pty():
                while True:
                    data = await websocket.receive_bytes()
                    os.write(master_fd, data)

            await asyncio.gather(read_pty(), write_pty())
        except WebSocketDisconnect:
            os.kill(pid, 9)
```

---

## Quy tắc Bắt buộc

1. **KHÔNG dùng `setInterval` để polling API** cho monitoring data — phải dùng SSE.
2. **SSE phải có auto-reconnect** (như pattern trên) vì Pi có thể lag khi load cao.
3. **WebSocket endpoint phải bắt `WebSocketDisconnect`** để cleanup process con không bị zombie.
4. **Header `X-Accel-Buffering: no`** phải có nếu triển khai sau Nginx reverse proxy.
