import psutil
from pathlib import Path
from datetime import datetime, timezone
from ..models.schemas import SystemStatsResponse, CpuStats, RamStats, DiskStats

TEMP_WARN, TEMP_CRIT = 65.0, 80.0
RAM_WARN,  RAM_CRIT  = 75.0, 90.0
DISK_WARN, DISK_CRIT = 80.0, 90.0

def _get_temp_via_vcgencmd() -> float | None:
    import subprocess
    try:
        # Run command without shell=True safely
        result = subprocess.run(
            ["vcgencmd", "measure_temp"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode == 0:
            # Output format: "temp=45.7'C" or similar
            parts = result.stdout.strip().split("=")
            if len(parts) >= 2:
                return float(parts[1].replace("'C", "").replace("C", ""))
    except Exception:
        pass
    return None

def get_cpu_temperature() -> float | None:
    try:
        raw = Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()
        return int(raw) / 1000.0
    except Exception:
        # Fallback to vcgencmd if thermal sysfs is not accessible
        return _get_temp_via_vcgencmd()

def _alert_level(temp, ram_pct, disk_pct) -> str:
    t = temp or 0
    if t >= TEMP_CRIT or ram_pct >= RAM_CRIT or disk_pct >= DISK_CRIT:
        return "danger"
    if t >= TEMP_WARN or ram_pct >= RAM_WARN or disk_pct >= DISK_WARN:
        return "warning"
    return "ok"

def get_system_stats() -> SystemStatsResponse:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    freq = psutil.cpu_freq()
    temp = get_cpu_temperature()
    
    # Safely get load average (psutil.getloadavg() throws AttributeError on Windows)
    try:
        load_avg = list(psutil.getloadavg())
    except AttributeError:
        load_avg = [0.0, 0.0, 0.0]
        
    return SystemStatsResponse(
        cpu=CpuStats(
            percent=psutil.cpu_percent(interval=0.1),
            freq_mhz=freq.current if freq else None,
            core_count=psutil.cpu_count(logical=True) or 4,
        ),
        ram=RamStats(
            total_bytes=mem.total,
            used_bytes=mem.used,
            percent=mem.percent
        ),
        disk=DiskStats(
            total_bytes=disk.total,
            used_bytes=disk.used,
            percent=disk.percent,
            mount_point="/"
        ),
        cpu_temp_celsius=temp,
        uptime_seconds=int(
            datetime.now(timezone.utc).timestamp() - psutil.boot_time()
        ),
        load_avg=load_avg,
        alert_level=_alert_level(temp, mem.percent, disk.percent),
        timestamp=datetime.now(timezone.utc),
    )
