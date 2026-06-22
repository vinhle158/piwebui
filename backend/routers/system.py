import asyncio
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
                # model_dump_json() outputs JSON serialized stats
                data = get_system_stats().model_dump_json()
                yield f"data: {data}\n\n"
            except Exception:
                yield "data: {}\n\n"
            await asyncio.sleep(2)
            
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/reboot")
async def reboot():
    try:
        await run_command(["sudo", "shutdown", "-r", "+0"])
    except FileNotFoundError:
        return {"message": "Reboot command not supported on this platform"}
    return {"message": "Đang khởi động lại..."}

@router.post("/shutdown")
async def shutdown():
    try:
        await run_command(["sudo", "shutdown", "-h", "now"])
    except FileNotFoundError:
        return {"message": "Shutdown command not supported on this platform"}
    return {"message": "Đang tắt..."}
