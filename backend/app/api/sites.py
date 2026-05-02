from datetime import datetime

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
from app.models.solution_epoch import SolutionEpoch
from app.models.solve_job import SolveJob
from app.schemas.common import PaginatedItems
from app.schemas.site import ObservationSummary, SiteCreate, SiteNetworkRead, SiteRead, SiteUpdate
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/sites", tags=["sites"])


def _add_count(counter: dict[str, int], key: str | None) -> None:
    if not key:
        return
    counter[key] = counter.get(key, 0) + 1


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    if not intervals:
        return []

    ordered = sorted(intervals, key=lambda item: item[0])
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        previous_start, previous_end = merged[-1]
        if start <= previous_end:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def _build_gaps(
    window_start: datetime | None,
    window_end: datetime | None,
    intervals: list[tuple[datetime, datetime]],
) -> list[dict]:
    if window_start is None or window_end is None or window_end <= window_start:
        return []

    gaps: list[dict] = []
    cursor = window_start
    for start, end in intervals:
        if start > cursor:
            gaps.append(
                {
                    "start_time": cursor,
                    "end_time": start,
                    "duration_seconds": round((start - cursor).total_seconds(), 3),
                }
            )
        cursor = max(cursor, end)
    if cursor < window_end:
        gaps.append(
            {
                "start_time": cursor,
                "end_time": window_end,
                "duration_seconds": round((window_end - cursor).total_seconds(), 3),
            }
        )
    return gaps


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
async def get_site_observation_summary(
    site_id: int,
    db: DBSession,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    file_period: str | None = None,
    file_type: str | None = None,
    with_remote: bool = False,
):
    site = db.get(Site, site_id)
    if site is None or site.is_deleted:
        raise HTTPException(status_code=404, detail="Site not found")

    query = select(RinexFile).where(RinexFile.site_id == site_id)
    if file_period:
        query = query.where(RinexFile.file_period == file_period)
    if file_type:
        query = query.where(RinexFile.file_type == file_type)
    if start_time:
        query = query.where(or_(RinexFile.end_time.is_(None), RinexFile.end_time >= start_time))
    if end_time:
        query = query.where(or_(RinexFile.start_time.is_(None), RinexFile.start_time <= end_time))

    files = db.scalars(query.order_by(RinexFile.start_time.asc(), RinexFile.filename.asc())).all()
    intervals: list[tuple[datetime, datetime]] = []
    files_by_type: dict[str, int] = {}
    files_by_period: dict[str, int] = {}
    constellations: set[str] = set()

    for rinex_file in files:
        _add_count(files_by_type, rinex_file.file_type)
        _add_count(files_by_period, rinex_file.file_period)
        for constellation in rinex_file.constellations_json or []:
            constellations.add(str(constellation))
        for constellation in (rinex_file.header_json or {}).get("constellations", []):
            constellations.add(str(constellation))

        if rinex_file.start_time is None or rinex_file.end_time is None or rinex_file.end_time <= rinex_file.start_time:
            continue
        clipped_start = max(rinex_file.start_time, start_time) if start_time else rinex_file.start_time
        clipped_end = min(rinex_file.end_time, end_time) if end_time else rinex_file.end_time
        if clipped_end > clipped_start:
            intervals.append((clipped_start, clipped_end))

    merged_intervals = _merge_intervals(intervals)
    summary_start = start_time or (min((interval[0] for interval in merged_intervals), default=None))
    summary_end = end_time or (max((interval[1] for interval in merged_intervals), default=None))
    covered_seconds = sum((end - start).total_seconds() for start, end in merged_intervals)
    expected_seconds = (
        (summary_end - summary_start).total_seconds()
        if summary_start is not None and summary_end is not None and summary_end > summary_start
        else 0.0
    )
    coverage_ratio = round(covered_seconds / expected_seconds, 4) if expected_seconds else 0.0

    return ok(
        ObservationSummary(
            site_id=site_id,
            start_time=summary_start,
            end_time=summary_end,
            local_file_count=len(files),
            remote_file_count=0 if with_remote else 0,
            coverage_ratio=coverage_ratio,
            covered_seconds=round(covered_seconds, 3),
            expected_seconds=round(expected_seconds, 3),
            downloaded_file_count=sum(1 for item in files if item.download_status == "downloaded"),
            indexed_file_count=sum(1 for item in files if item.index_status == "indexed"),
            available_constellations=sorted(constellations),
            files_by_type=files_by_type,
            files_by_period=files_by_period,
            gaps=_build_gaps(summary_start, summary_end, merged_intervals),
        )
    )


@router.get("/{site_id}/status-history")
async def get_site_status_history(site_id: int, db: DBSession):
    site = db.get(Site, site_id)
    if site is None or site.is_deleted:
        raise HTTPException(status_code=404, detail="Site not found")

    jobs = db.scalars(
        select(SolveJob)
        .where(SolveJob.request_json["siteId"].as_integer() == site_id)
        .order_by(SolveJob.created_at.asc())
    ).all()
    job_ids = [job.id for job in jobs]
    if not job_ids:
        return ok(
            {
                "site_id": site_id,
                "solve_job_count": 0,
                "succeeded_job_count": 0,
                "solve_success_rate": None,
                "points": [],
            }
        )

    epochs = db.scalars(
        select(SolutionEpoch)
        .where(SolutionEpoch.job_id.in_(job_ids))
        .order_by(SolutionEpoch.epoch_time.asc())
    ).all()
    succeeded = sum(1 for job in jobs if job.status == "succeeded")
    return ok(
        {
            "site_id": site_id,
            "solve_job_count": len(jobs),
            "succeeded_job_count": succeeded,
            "solve_success_rate": round(succeeded / len(jobs), 4) if jobs else None,
            "latest_job_time": jobs[-1].created_at if jobs else None,
            "points": [
                {
                    "job_id": epoch.job_id,
                    "epoch_time": epoch.epoch_time,
                    "solution_status": epoch.solution_status,
                    "pdop": epoch.pdop,
                    "hdop": epoch.hdop,
                    "vdop": epoch.vdop,
                    "nsat_used": epoch.nsat_used,
                    "sigma0": epoch.sigma0,
                }
                for epoch in epochs
            ],
        }
    )
