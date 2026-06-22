from fastapi import APIRouter, HTTPException, UploadFile, Query
from pathlib import Path
import aiofiles
import shutil
from ..services.file_ops import list_directory, read_file, write_file, _safe
from ..models.schemas import FileListResponse, FileContentResponse, FileWriteRequest
from ..config import settings

router = APIRouter()

@router.get("", response_model=FileListResponse)
async def list_files(path: str = None):
    """
    List contents of the directory specified by `path`.
    If no path is specified, defaults to the configured file manager root.
    """
    try:
        target_path = path or str(settings.file_manager_root)
        return FileListResponse(**list_directory(target_path))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Thư mục không tồn tại")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống: {str(e)}")

@router.get("/content", response_model=FileContentResponse)
async def get_content(path: str):
    """
    Read the content of a text file.
    """
    try:
        content = await read_file(path)
        return FileContentResponse(path=path, content=content)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File không tồn tại")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Không thể đọc file dạng binary hoặc encode không phải UTF-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file: {str(e)}")

@router.put("/content")
async def save_content(req: FileWriteRequest):
    """
    Write content to a file atomically.
    """
    try:
        await write_file(req.path, req.content)
        return {"message": "Đã lưu thành công"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi ghi file: {str(e)}")

@router.post("/upload")
async def upload(file: UploadFile, path: str):
    """
    Upload a file to the target path directory.
    """
    target_dir = Path(path)
    if not _safe(target_dir) or not target_dir.is_dir():
        raise HTTPException(status_code=403, detail="Không được phép upload vào đường dẫn này")
        
    target_file = target_dir / file.filename
    if not _safe(target_file):
        raise HTTPException(status_code=403, detail="Tên file hoặc đường dẫn không an toàn")
        
    try:
        async with aiofiles.open(target_file, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                await f.write(chunk)
        return {"message": f"Đã upload thành công: {file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi upload file: {str(e)}")

@router.delete("")
async def delete(path: str):
    """
    Delete a file or folder. Root directory is protected from deletion.
    """
    target = Path(path)
    if not _safe(target):
        raise HTTPException(status_code=403, detail="Không được phép xóa đường dẫn này")
        
    # Prevent deleting the root directory
    if target.resolve() == settings.file_manager_root.resolve():
        raise HTTPException(status_code=403, detail="Không được phép xóa thư mục gốc")
        
    if not target.exists():
        raise HTTPException(status_code=404, detail="Đường dẫn không tồn tại")
        
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"message": f"Đã xóa thành công: {path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xóa: {str(e)}")

@router.post("/folder")
async def create_folder(path: str):
    """
    Create a new directory (convenience endpoint).
    """
    target = Path(path)
    if not _safe(target):
        raise HTTPException(status_code=403, detail="Không được phép tạo thư mục ở đây")
        
    try:
        target.mkdir(parents=True, exist_ok=True)
        return {"message": "Đã tạo thư mục thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo thư mục: {str(e)}")
