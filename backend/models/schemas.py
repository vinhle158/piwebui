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
