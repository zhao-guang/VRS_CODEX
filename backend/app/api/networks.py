from sqlalchemy import func, or_, select
from sqlalchemy.orm import aliased

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DBSession
from app.api.response import ok
from app.models.membership import NetworkSiteMembership
from app.models.network import Network
from app.models.site import Site
from app.schemas.common import PaginatedItems
from app.schemas.network import MembershipBindRequest, NetworkCreate, NetworkRead, NetworkUpdate
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/networks", tags=["networks"])


@router.get("")
async def list_networks(
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    keyword: str | None = None,
    source_type: str | None = None,
    status: str | None = None,
):
    count_memberships = aliased(NetworkSiteMembership)
    query = (
        select(Network, func.count(count_memberships.id).label("site_count"))
        .outerjoin(count_memberships, Network.id == count_memberships.network_id)
        .where(Network.is_deleted.is_(False))
        .group_by(Network.id)
        .order_by(Network.updated_at.desc())
    )

    total_query = select(func.count(Network.id)).where(Network.is_deleted.is_(False))

    if keyword:
        predicate = or_(Network.name.ilike(f"%{keyword}%"), Network.description.ilike(f"%{keyword}%"))
        query = query.where(predicate)
        total_query = total_query.where(predicate)
    if source_type:
        query = query.where(Network.source_type == source_type)
        total_query = total_query.where(Network.source_type == source_type)
    if status:
        query = query.where(Network.status == status)
        total_query = total_query.where(Network.status == status)

    total = db.scalar(total_query) or 0
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).all()
    items = [NetworkRead.model_validate({**network.__dict__, "site_count": site_count}) for network, site_count in rows]
    return ok(PaginatedItems(items=items, total=total, page=page, page_size=page_size))


@router.post("")
async def create_network(payload: NetworkCreate, db: DBSession):
    network = Network(**payload.model_dump(), source_type="local")
    db.add(network)
    db.flush()
    write_audit_log(db, entity_type="network", entity_id=network.id, action="create", before=None, after=payload.model_dump())
    db.commit()
    db.refresh(network)
    return ok(NetworkRead.model_validate({**network.__dict__, "site_count": 0}))


@router.get("/{network_id}")
async def get_network(network_id: int, db: DBSession):
    network = db.get(Network, network_id)
    if not network or network.is_deleted:
        raise HTTPException(status_code=404, detail="Network not found")
    site_count = db.scalar(
        select(func.count(NetworkSiteMembership.id)).where(NetworkSiteMembership.network_id == network_id)
    ) or 0
    return ok(NetworkRead.model_validate({**network.__dict__, "site_count": site_count}))


@router.patch("/{network_id}")
async def update_network(network_id: int, payload: NetworkUpdate, db: DBSession):
    network = db.get(Network, network_id)
    if not network or network.is_deleted:
        raise HTTPException(status_code=404, detail="Network not found")

    before = {"name": network.name, "description": network.description, "status": network.status}
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(network, key, value)
    write_audit_log(db, entity_type="network", entity_id=network.id, action="update", before=before, after=updates)
    db.commit()
    db.refresh(network)
    site_count = db.scalar(
        select(func.count(NetworkSiteMembership.id)).where(NetworkSiteMembership.network_id == network_id)
    ) or 0
    return ok(NetworkRead.model_validate({**network.__dict__, "site_count": site_count}))


@router.delete("/{network_id}")
async def delete_network(network_id: int, db: DBSession):
    network = db.get(Network, network_id)
    if not network or network.is_deleted:
        raise HTTPException(status_code=404, detail="Network not found")
    before = {"name": network.name, "status": network.status}
    network.is_deleted = True
    network.status = "deleted"
    write_audit_log(db, entity_type="network", entity_id=network.id, action="delete", before=before, after={"is_deleted": True})
    db.commit()
    return ok({"deleted": True, "id": network_id})


@router.get("/{network_id}/sites")
async def list_network_sites(network_id: int, db: DBSession):
    network = db.get(Network, network_id)
    if not network or network.is_deleted:
        raise HTTPException(status_code=404, detail="Network not found")

    rows = db.execute(
        select(Site)
        .join(NetworkSiteMembership, NetworkSiteMembership.site_id == Site.id)
        .where(NetworkSiteMembership.network_id == network_id, Site.is_deleted.is_(False))
        .order_by(Site.four_char_id.asc())
    ).scalars()
    items = [
        {
            "id": site.id,
            "name": site.name,
            "four_char_id": site.four_char_id,
            "domes_number": site.domes_number,
            "site_status": site.site_status,
            "latitude": site.latitude,
            "longitude": site.longitude,
        }
        for site in rows
    ]
    return ok(items)


@router.post("/{network_id}/sites")
async def bind_sites_to_network(network_id: int, payload: MembershipBindRequest, db: DBSession):
    network = db.get(Network, network_id)
    if not network or network.is_deleted:
        raise HTTPException(status_code=404, detail="Network not found")

    attached_site_ids: list[int] = []
    for site_id in payload.site_ids:
        site = db.get(Site, site_id)
        if not site or site.is_deleted:
            continue
        exists = db.scalar(
            select(NetworkSiteMembership.id).where(
                NetworkSiteMembership.network_id == network_id,
                NetworkSiteMembership.site_id == site_id,
                NetworkSiteMembership.valid_from == payload.valid_from,
            )
        )
        if exists:
            continue
        membership = NetworkSiteMembership(
            network_id=network_id,
            site_id=site_id,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
            source_type="local",
        )
        db.add(membership)
        attached_site_ids.append(site_id)

    db.commit()
    return ok({"network_id": network_id, "attached_site_ids": attached_site_ids})


@router.delete("/{network_id}/sites/{site_id}")
async def remove_site_from_network(network_id: int, site_id: int, db: DBSession):
    membership = db.scalar(
        select(NetworkSiteMembership).where(
            NetworkSiteMembership.network_id == network_id,
            NetworkSiteMembership.site_id == site_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.delete(membership)
    db.commit()
    return ok({"removed": True, "network_id": network_id, "site_id": site_id})
