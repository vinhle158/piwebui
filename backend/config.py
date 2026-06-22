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
