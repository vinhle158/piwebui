import asyncio, logging
from ..config import settings

logger = logging.getLogger(__name__)

async def run_command(args: list[str], timeout: int = 10) -> tuple[int, str, str]:
    """Chạy subprocess an toàn. KHÔNG shell=True."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as e:
        return -1, "", f"Command not found: {e}"
    except Exception as e:
        return -1, "", f"Error running command: {e}"

    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
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
