from pydantic import BaseModel

from fastapi import APIRouter
import httpx
from sqlalchemy import text

from app.api.deps import DBSession
from app.api.response import ok
from app.core.config import settings
from app.services.npi_service import bootstrap_npi_data
from app.services.sync_service import apply_npi_refresh, build_npi_preview
from app.services.system_service import get_bootstrap_status

router = APIRouter(prefix="/system", tags=["system"])


class BootstrapRequest(BaseModel):
    force: bool = False


class SyncApplyRequest(BaseModel):
    force: bool = True


@router.get("/health")
async def health_check(db: DBSession):
    db.execute(text("SELECT 1"))
    solver_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.solver_base_url}/health")
            if response.is_success:
                solver_status = "ok"
    except Exception:
        solver_status = "offline"
    return ok(
        {
            "backend": {"status": "ok", "name": settings.app_name, "version": settings.app_version},
            "database": {"status": "ok", "path": str(settings.database_path)},
            "storage": {"status": "ok", "data_dir": str(settings.data_dir)},
            "solver": {"status": solver_status, "base_url": settings.solver_base_url},
        }
    )


@router.get("/bootstrap-status")
async def bootstrap_status(db: DBSession):
    return ok(get_bootstrap_status(db))


@router.post("/bootstrap")
async def bootstrap(db: DBSession, payload: BootstrapRequest | None = None):
    return ok(await bootstrap_npi_data(db, force=payload.force if payload else False))


@router.get("/capabilities")
async def capabilities():
    return ok(
        {
            "constellations": ["GPS", "BDS", "GAL", "GLO"],
            "solver_modes": ["spp", "rtd", "rtk"],
            "formats": ["rinex2", "rinex3", "rinex4", "crx", "gz"],
            "platforms": ["linux-x86_64", "windows-x86_64", "macos-arm64"],
        }
    )


@router.post("/sync/npi/preview")
async def sync_npi_preview(db: DBSession):
    return ok(
        await build_npi_preview(
            db,
            networks_url=settings.npi_networks_url,
            sites_url=settings.npi_sites_url,
        )
    )


@router.post("/sync/npi/apply")
async def sync_npi_apply(db: DBSession, payload: SyncApplyRequest | None = None):
    return ok(await apply_npi_refresh(db, force=payload.force if payload else True))
