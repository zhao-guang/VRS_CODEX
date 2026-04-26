from fastapi import APIRouter, HTTPException

from app.api.deps import DBSession
from app.api.response import ok
from app.schemas.common import PaginatedItems
from app.schemas.solve_jobs import (
    SatelliteStateRead,
    SolutionEpochRead,
    SolveJobRead,
    SolveResultRead,
    SppPrecheckRead,
    SppPrecheckRequest,
    SppSolveRequest,
)
from app.services.precheck_service import run_spp_precheck
from app.services.solve_job_service import create_spp_job, get_job, list_jobs

router = APIRouter(prefix="/solve-jobs", tags=["solve-jobs"])


@router.get("")
async def list_solve_jobs(db: DBSession):
    jobs = list_jobs(db)
    items = [
        SolveJobRead.model_validate(
            {
                **job.__dict__,
                "engine": job.result.engine if job.result else None,
                "summary": job.result.summary_json if job.result else None,
            }
        )
        for job in jobs
    ]
    return ok(PaginatedItems(items=items, total=len(items), page=1, page_size=len(items) or 20))


@router.post("/spp")
async def create_spp_solve_job(payload: SppSolveRequest, db: DBSession):
    try:
        job = await create_spp_job(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok(
        SolveJobRead.model_validate(
            {
                **job.__dict__,
                "engine": job.result.engine if job.result else None,
                "summary": job.result.summary_json if job.result else None,
            }
        )
    )


@router.post("/spp/precheck")
async def precheck_spp_solve_job(payload: SppPrecheckRequest, db: DBSession):
    try:
        result = run_spp_precheck(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok(SppPrecheckRead.model_validate(result))


@router.get("/{job_id}")
async def get_solve_job(job_id: int, db: DBSession):
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solve job not found")
    return ok(
        SolveJobRead.model_validate(
            {
                **job.__dict__,
                "engine": job.result.engine if job.result else None,
                "summary": job.result.summary_json if job.result else None,
            }
        )
    )


@router.get("/{job_id}/result")
async def get_solve_result(job_id: int, db: DBSession):
    job = get_job(db, job_id)
    if job is None or job.result is None:
        raise HTTPException(status_code=404, detail="Solve result not found")
    return ok(
        SolveResultRead(
            job_id=job.id,
            engine=job.result.engine,
            summary=job.result.summary_json,
            quality=job.result.quality_json,
        )
    )


@router.get("/{job_id}/epochs")
async def get_solve_epochs(job_id: int, db: DBSession):
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solve job not found")
    return ok([SolutionEpochRead.model_validate(epoch) for epoch in sorted(job.epochs, key=lambda item: item.epoch_time)])


@router.get("/{job_id}/satellites")
async def get_solve_satellites(job_id: int, db: DBSession):
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solve job not found")
    return ok(
        [
            SatelliteStateRead.model_validate(sample)
            for sample in sorted(job.satellites, key=lambda item: (item.epoch_time, item.satellite_system, item.satellite_prn))
        ]
    )


@router.get("/{job_id}/logs")
async def get_solve_logs(job_id: int, db: DBSession):
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solve job not found")
    return ok(
        {
            "job_id": job.id,
            "status": job.status,
            "error_message": job.error_message,
            "solver_job_id": job.solver_job_id,
        }
    )
