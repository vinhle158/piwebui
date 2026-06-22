import os
import aiofiles
import tempfile
from pathlib import Path
from datetime import datetime
from ..config import settings

def _safe(path: Path) -> bool:
    """
    Checks if a path is safe to access (must be within the file_manager_root and not restricted).
    Supports relative and absolute path validation on both Windows and Linux.
    """
    try:
        resolved_path = path.resolve()
        resolved_root = settings.file_manager_root.resolve()
        
        # Check if the path is inside the root directory
        resolved_path.relative_to(resolved_root)
        
        # Check against restricted paths
        for restricted in settings.file_manager_restricted:
            restricted_path = Path(restricted)
            if resolved_path == restricted_path:
                return False
            if restricted_path.is_absolute():
                try:
                    if resolved_path == restricted_path.resolve() or resolved_path.relative_to(restricted_path.resolve()):
                        return False
                except ValueError:
                    pass
                    
        return True
    except ValueError:
        return False

def list_directory(path: str) -> dict:
    """
    Lists the contents of a directory, separating files and folders.
    Returns path, parent path, and structured file metadata entries.
    """
    target = Path(path)
    if not _safe(target) or not target.is_dir():
        raise PermissionError(f"Không được phép truy cập hoặc thư mục không tồn tại: {path}")
        
    entries = []
    for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        try:
            st = item.stat()
            entries.append({
                "name": item.name,
                "path": str(item),
                "is_dir": item.is_dir(),
                "size_bytes": st.st_size if item.is_file() else None,
                "modified_at": datetime.fromtimestamp(st.st_mtime),
                "permissions": oct(st.st_mode)[-3:],
            })
        except (OSError, PermissionError):
            # Skip files that we don't have permission to read stat for
            pass
            
    # Calculate parent directory safety
    resolved_target = target.resolve()
    resolved_root = settings.file_manager_root.resolve()
    
    if resolved_target == resolved_root:
        parent_path = None
    else:
        parent_path = str(target.parent)
        
    return {
        "path": str(target),
        "parent": parent_path,
        "entries": entries,
    }

async def read_file(path: str) -> str:
    """
    Asynchronously reads the text content of a file.
    """
    target = Path(path)
    if not _safe(target) or not target.is_file():
        raise PermissionError(f"Không được phép truy cập hoặc file không tồn tại: {path}")
        
    async with aiofiles.open(target, "r", encoding="utf-8", errors="replace") as f:
        return await f.read()

async def write_file(path: str, content: str) -> None:
    """
    Asynchronously writes content to a file atomically.
    Ensures parent directories exist.
    """
    target = Path(path)
    if not _safe(target):
        raise PermissionError(f"Không được phép ghi file vào đường dẫn này: {path}")
        
    # Ensure parent directory exists
    target.parent.mkdir(parents=True, exist_ok=True)
    
    # Atomic write to prevent file corruption during power failures on Pi
    fd, tmp_path = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as tmp:
            tmp.write(content)
        os.replace(tmp_path, target)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise e
