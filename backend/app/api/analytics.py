from fastapi import APIRouter

from app.api.deps import DBSession
from app.api.response import ok
from app.services.analytics_service import (
    network_overview as build_network_overview,
    satellite_history as build_satellite_history,
    site_availability as build_site_availability,
    site_epochs as build_site_epochs,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/network-overview")
async def get_network_overview(db: DBSession):
    return ok(build_network_overview(db))


@router.get("/site-availability")
async def get_site_availability(db: DBSession):
    return ok(build_site_availability(db))


@router.get("/site-epochs")
async def get_site_epochs(db: DBSession, site_id: int | None = None):
    return ok(build_site_epochs(db, site_id))


@router.get("/satellite-history")
async def get_satellite_history(db: DBSession, satellite_system: str | None = None, satellite_prn: str | None = None):
    return ok(build_satellite_history(db, satellite_system=satellite_system, satellite_prn=satellite_prn))
