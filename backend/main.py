from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .routers import system, services, network, files, terminal
from .db.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Pi WebUI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router,   prefix="/api/system",   tags=["System"])
app.include_router(services.router, prefix="/api/services", tags=["Services"])
app.include_router(network.router,  prefix="/api/network",  tags=["Network"])
app.include_router(files.router,    prefix="/api/files",    tags=["Files"])
app.include_router(terminal.router, prefix="/ws",           tags=["Terminal"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "Backend foundation is working!"}

# Dynamically resolve frontend directory relative to this main.py file
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
