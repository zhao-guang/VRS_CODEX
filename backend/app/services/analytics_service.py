from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.network import Network
from app.models.rinex_file import RinexFile
from app.models.satellite_state_sample import SatelliteStateSample
from app.models.site import Site
from app.models.solve_job import SolveJob
from app.models.solution_epoch import SolutionEpoch


def network_overview(db: Session) -> dict:
    network_count = db.scalar(select(func.count(Network.id)).where(Network.is_deleted.is_(False))) or 0
    site_count = db.scalar(select(func.count(Site.id)).where(Site.is_deleted.is_(False))) or 0
    rinex_count = db.scalar(select(func.count(RinexFile.id))) or 0
    job_count = db.scalar(select(func.count(SolveJob.id))) or 0
    succeeded = db.scalar(select(func.count(SolveJob.id)).where(SolveJob.status == "succeeded")) or 0
    success_rate = round(succeeded / job_count, 4) if job_count else None

    return {
        "totals": {
            "networks": network_count,
            "sites": site_count,
            "rinex_files": rinex_count,
        },
        "solve_jobs": job_count,
        "recent_success_rate": success_rate,
    }


def site_availability(db: Session) -> list[dict]:
    sites = db.scalars(select(Site).where(Site.is_deleted.is_(False)).order_by(Site.four_char_id.asc())).all()
    rinex_counts = dict(
        db.execute(select(RinexFile.site_id, func.count(RinexFile.id)).group_by(RinexFile.site_id)).all()
    )
    jobs = db.scalars(select(SolveJob)).all()
    success_by_site: dict[int, int] = defaultdict(int)
    total_by_site: dict[int, int] = defaultdict(int)

    for job in jobs:
        site_id = job.request_json.get("siteId")
        if not isinstance(site_id, int):
            continue
        total_by_site[site_id] += 1
        if job.status == "succeeded":
            success_by_site[site_id] += 1

    items = []
    for site in sites:
        total_jobs = total_by_site.get(site.id, 0)
        succeeded_jobs = success_by_site.get(site.id, 0)
        items.append(
            {
                "site_id": site.id,
                "four_char_id": site.four_char_id,
                "site_name": site.name,
                "site_status": site.site_status,
                "rinex_file_count": rinex_counts.get(site.id, 0),
                "solve_job_count": total_jobs,
                "solve_success_rate": round(succeeded_jobs / total_jobs, 4) if total_jobs else None,
                "has_local_data": rinex_counts.get(site.id, 0) > 0,
            }
        )
    return items


def site_epochs(db: Session, site_id: int | None = None) -> list[dict]:
    jobs = db.scalars(select(SolveJob)).all()
    site_job_ids = []
    for job in jobs:
        request_site_id = job.request_json.get("siteId")
        if site_id is not None and request_site_id != site_id:
            continue
        if request_site_id is not None:
            site_job_ids.append(job.id)

    if not site_job_ids:
        return []

    epochs = db.scalars(
        select(SolutionEpoch).where(SolutionEpoch.job_id.in_(site_job_ids)).order_by(SolutionEpoch.epoch_time.asc())
    ).all()
    return [
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
    ]


def satellite_history(
    db: Session,
    *,
    satellite_system: str | None = None,
    satellite_prn: str | None = None,
) -> list[dict]:
    query = select(SatelliteStateSample).order_by(SatelliteStateSample.epoch_time.asc())
    if satellite_system:
        query = query.where(SatelliteStateSample.satellite_system == satellite_system)
    if satellite_prn:
        query = query.where(SatelliteStateSample.satellite_prn == satellite_prn)
    samples = db.scalars(query).all()
    return [
        {
            "job_id": sample.job_id,
            "epoch_time": sample.epoch_time,
            "satellite_system": sample.satellite_system,
            "satellite_prn": sample.satellite_prn,
            "elevation_deg": sample.elevation_deg,
            "azimuth_deg": sample.azimuth_deg,
            "snr": sample.snr,
            "used_in_solution": sample.used_in_solution,
            "health_status": sample.health_status,
            "cycle_slip_detected": sample.cycle_slip_detected,
            "residual_code": sample.residual_code,
            "residual_phase": sample.residual_phase,
        }
        for sample in samples
    ]
