from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.rinex_file import RinexFile
from app.models.satellite_state_sample import SatelliteStateSample
from app.models.site import Site
from app.models.solve_job import SolveJob
from app.models.solve_result import SolveResult
from app.models.solution_epoch import SolutionEpoch
from app.schemas.solve_jobs import SppSolveRequest
from app.services.solver_bridge import run_spp_solver


def _load_job(db: Session, job_id: int) -> SolveJob | None:
    return db.scalar(
        select(SolveJob)
        .where(SolveJob.id == job_id)
        .options(
            selectinload(SolveJob.result),
            selectinload(SolveJob.epochs),
            selectinload(SolveJob.satellites),
        )
    )


def list_jobs(db: Session) -> list[SolveJob]:
    return db.scalars(
        select(SolveJob)
        .options(selectinload(SolveJob.result))
        .order_by(SolveJob.created_at.desc())
    ).all()


async def create_spp_job(db: Session, request: SppSolveRequest) -> SolveJob:
    site = db.get(Site, request.site_id)
    if site is None or site.is_deleted:
        raise ValueError("Site not found.")

    obs_file = db.get(RinexFile, request.observation_file_id)
    if obs_file is None:
        raise ValueError("Observation RINEX file not found.")
    if obs_file.local_path is None:
        raise ValueError("Observation RINEX file is not downloaded locally.")

    nav_files: list[RinexFile] = []
    for nav_file_id in request.navigation_file_ids:
        nav_file = db.get(RinexFile, nav_file_id)
        if nav_file is None:
            raise ValueError(f"Navigation RINEX file not found: {nav_file_id}")
        if nav_file.local_path is None:
            raise ValueError(f"Navigation RINEX file is not downloaded locally: {nav_file_id}")
        if nav_file.file_type != "nav":
            raise ValueError(f"RINEX file is not a navigation file: {nav_file_id}")
        nav_files.append(nav_file)

    if not nav_files:
        raise ValueError("At least one navigation RINEX file is required for real SPP.")

    job = SolveJob(
        job_type="spp",
        status="running",
        request_json=request.model_dump(mode="json", by_alias=True),
        started_at=datetime.now(tz=UTC),
    )
    db.add(job)
    db.flush()

    try:
        solver_payload = await run_spp_solver(site, obs_file, nav_files, request)
        job.solver_job_id = solver_payload.get("jobId")
        job.status = solver_payload.get("status", "succeeded")
        job.finished_at = datetime.now(tz=UTC)
        job.error_message = solver_payload.get("error")

        result = SolveResult(
            job_id=job.id,
            engine=solver_payload.get("engine", "solver_stub"),
            summary_json=solver_payload.get("summary", {}),
            quality_json=solver_payload.get("quality", {}),
            raw_response_json=solver_payload,
        )
        db.add(result)

        for epoch_payload in solver_payload.get("epochs", []):
            ecef = epoch_payload.get("ecef", {})
            geodetic = epoch_payload.get("geodetic", {})
            db.add(
                SolutionEpoch(
                    job_id=job.id,
                    epoch_time=datetime.fromisoformat(epoch_payload["epochTime"].replace("Z", "+00:00")),
                    site_role=epoch_payload.get("siteRole", "single"),
                    solution_status=epoch_payload.get("solutionStatus", "code"),
                    x=ecef.get("x"),
                    y=ecef.get("y"),
                    z=ecef.get("z"),
                    latitude=geodetic.get("latitude"),
                    longitude=geodetic.get("longitude"),
                    height=geodetic.get("height"),
                    pdop=epoch_payload.get("pdop"),
                    hdop=epoch_payload.get("hdop"),
                    vdop=epoch_payload.get("vdop"),
                    nsat_used=epoch_payload.get("nsatUsed"),
                    sigma0=epoch_payload.get("sigma0"),
                    residual_summary_json=epoch_payload.get("residualSummary"),
                )
            )
        for satellite_payload in solver_payload.get("satellites", []):
            db.add(
                SatelliteStateSample(
                    job_id=job.id,
                    epoch_time=datetime.fromisoformat(satellite_payload["epochTime"].replace("Z", "+00:00")),
                    satellite_system=satellite_payload.get("satelliteSystem", "GPS"),
                    satellite_prn=satellite_payload.get("satellitePrn", "G00"),
                    elevation_deg=satellite_payload.get("elevationDeg"),
                    azimuth_deg=satellite_payload.get("azimuthDeg"),
                    snr=satellite_payload.get("snr"),
                    used_in_solution=satellite_payload.get("usedInSolution", True),
                    health_status=satellite_payload.get("healthStatus", "healthy"),
                    cycle_slip_detected=satellite_payload.get("cycleSlip", False),
                    residual_code=satellite_payload.get("codeResidual"),
                    residual_phase=satellite_payload.get("phaseResidual"),
                )
            )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise

    loaded = _load_job(db, job.id)
    assert loaded is not None
    return loaded


def get_job(db: Session, job_id: int) -> SolveJob | None:
    return _load_job(db, job_id)
