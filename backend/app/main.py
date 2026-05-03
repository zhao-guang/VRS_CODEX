from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.services.npi_service import bootstrap_npi_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        await bootstrap_npi_data(db, force=False)
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)

frontend_dist = settings.project_root / "frontend" / "dist"
frontend_index = frontend_dist / "index.html"

if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/")
async def root():
    if frontend_index.exists():
        return FileResponse(frontend_index)
    return {"name": settings.app_name, "version": settings.app_version}


@app.get("/{full_path:path}")
async def frontend_app(full_path: str):
    if frontend_index.exists():
        requested_path = (frontend_dist / full_path).resolve()
        try:
            requested_path.relative_to(frontend_dist.resolve())
        except ValueError:
            return FileResponse(frontend_index)

        if requested_path.is_file():
            return FileResponse(requested_path)
        return FileResponse(frontend_index)

    return {"name": settings.app_name, "version": settings.app_version}
