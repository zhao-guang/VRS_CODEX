from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DBSession
from app.api.response import ok
from app.models.audit_log import EntityAuditLog
from app.models.membership import NetworkSiteMembership
from app.models.network import Network
from app.models.rinex_file import RinexFile
from app.models.site import Site
from app.schemas.common import PaginatedItems
from app.schemas.site import ObservationSummary, SiteCreate, SiteNetworkRead, SiteRead, SiteUpdate
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/sites", tags=["sites"])


def _apply_site_payload(site: Site, data: dict) -> None:
    position = data.pop("approximate_position", None)
    monument = data.pop("monument", None)

    for key, value in data.items():
        setattr(site, key, value)

    if position is not None:
        site.latitude = position.get("latitude")
        site.longitude = position.get("longitude")
        site.ellipsoidal_height = position.get("ellipsoidal_height")

    if monument is not None:
        site.monument_description = monument.get("description")
        site.monument_foundation = monument.get("foundation")
        site.marker_description = monument.get("marker_description")
        site.monument_height = monument.get("height")


def _site_to_schema(site: Site) -> SiteRead:
    networks = [
        SiteNetworkRead.model_validate({"id": membership.network.id, "name": membership.network.name, "status": membership.network.status})
        for membership in site.memberships
        if membership.network and not membership.network.is_deleted
    ]
    return SiteRead.model_validate({**site.__dict__, "networks": networks})


@router.get("")
async def list_sites(
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    keyword: str | None = None,
    four_char_id: str | None = None,
    domes_number: str | None = None,
    network_id: int | None = None,
    site_status: str | None = None,
):
    query = select(Site).where(Site.is_deleted.is_(False)).options(
        selectinload(Site.memberships).selectinload(NetworkSiteMembership.network)
    )
    total_query = select(func.count(Site.id)).where(Site.is_deleted.is_(False))

    if keyword:
        predicate = or_(
            Site.name.ilike(f"%{keyword}%"),
            Site.four_char_id.ilike(f"%{keyword}%"),
            Site.domes_number.ilike(f"%{keyword}%"),
        )
        query = query.where(predicate)
        total_query = total_query.where(predicate)
    if four_char_id:
        predicate = Site.four_char_id.ilike(f"%{four_char_id}%")
        query = query.where(predicate)
        total_query = total_query.where(predicate)
    if domes_number:
        predicate = Site.domes_number.ilike(f"%{domes_number}%")
        query = query.where(predicate)
        total_query = total_query.where(predicate)
    if site_status:
        query = query.where(Site.site_status == site_status)
        total_query = total_query.where(Site.site_status == site_status)
    if network_id:
        query = query.join(NetworkSiteMembership).where(NetworkSiteMembership.network_id == network_id)
        total_query = total_query.join(NetworkSiteMembership).where(NetworkSiteMembership.network_id == network_id)

    total = db.scalar(total_query) or 0
    items = db.scalars(query.order_by(Site.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return ok(PaginatedItems(items=[_site_to_schema(site) for site in items], total=total, page=page, page_size=page_size))


@router.post("")
async def create_site(payload: SiteCreate, db: DBSession):
    site = Site(source_type="local")
    _apply_site_payload(site, payload.model_dump(exclude_none=True, by_alias=False))
    db.add(site)
    db.flush()
    write_audit_log(db, entity_type="site", entity_id=site.id, action="create", before=None, after=payload.model_dump(mode="json", by_alias=True))
    db.commit()
    db.refresh(site)
    return ok(_site_to_schema(site))


@router.get("/{site_id}")
async def get_site(site_id: int, db: DBSession):
    site = db.scalar(
        select(Site)
        .where(Site.id == site_id, Site.is_deleted.is_(False))
        .options(selectinload(Site.memberships).selectinload(NetworkSiteMembership.network))
    )
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return ok(_site_to_schema(site))


@router.patch("/{site_id}")
async def update_site(site_id: int, payload: SiteUpdate, db: DBSession):
    site = db.scalar(
        select(Site)
        .where(Site.id == site_id, Site.is_deleted.is_(False))
        .options(selectinload(Site.memberships).selectinload(NetworkSiteMembership.network))
    )
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")

    before = {
        "name": site.name,
        "four_char_id": site.four_char_id,
        "domes_number": site.domes_number,
        "site_status": site.site_status,
    }
    updates = payload.model_dump(exclude_unset=True, exclude_none=False)
    _apply_site_payload(site, updates)
    write_audit_log(db, entity_type="site", entity_id=site.id, action="update", before=before, after=payload.model_dump(mode="json", by_alias=True))
    db.commit()
    db.refresh(site)
    return ok(_site_to_schema(site))


@router.delete("/{site_id}")
async def delete_site(site_id: int, db: DBSession):
    site = db.get(Site, site_id)
    if site is None or site.is_deleted:
        raise HTTPException(status_code=404, detail="Site not found")
    before = {"name": site.name, "four_char_id": site.four_char_id}
    site.is_deleted = True
    write_audit_log(db, entity_type="site", entity_id=site.id, action="delete", before=before, after={"is_deleted": True})
    db.commit()
    return ok({"deleted": True, "id": site_id})


@router.get("/{site_id}/networks")
async def get_site_networks(site_id: int, db: DBSession):
    site = db.scalar(
        select(Site)
        .where(Site.id == site_id, Site.is_deleted.is_(False))
        .options(selectinload(Site.memberships).selectinload(NetworkSiteMembership.network))
    )
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return ok(
        [
            SiteNetworkRead.model_validate({"id": membership.network.id, "name": membership.network.name, "status": membership.network.status})
            for membership in site.memberships
            if membership.network and not membership.network.is_deleted
        ]
    )


@router.get("/{site_id}/history")
async def get_site_history(site_id: int, db: DBSession):
    rows = db.scalars(
        select(EntityAuditLog).where(EntityAuditLog.entity_type == "site", EntityAuditLog.entity_id == site_id).order_by(EntityAuditLog.created_at.desc())
    ).all()
    items = [
        {
            "id": row.id,
            "action": row.action,
            "before": row.before_json,
            "after": row.after_json,
            "operator": row.operator,
            "created_at": row.created_at,
        }
        for row in rows
    ]
    return ok(items)


@router.get("/{site_id}/observation-summary")
async def get_site_observation_summary(site_id: int, db: DBSession):
    site = db.get(Site, site_id)
    if site is None or site.is_deleted:
        raise HTTPException(status_code=404, detail="Site not found")
    local_file_count = db.scalar(select(func.count(RinexFile.id)).where(RinexFile.site_id == site_id)) or 0
    return ok(ObservationSummary(site_id=site_id, local_file_count=local_file_count))


@router.get("/{site_id}/status-history")
async def get_site_status_history(site_id: int, db: DBSession):
    site = db.get(Site, site_id)
    if site is None or site.is_deleted:
        raise HTTPException(status_code=404, detail="Site not found")
    return ok({"site_id": site_id, "points": []})
