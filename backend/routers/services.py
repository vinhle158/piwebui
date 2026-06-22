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
