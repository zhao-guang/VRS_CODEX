from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DBSession
from app.api.response import ok
from app.schemas.common import PaginatedItems
from app.schemas.rinex import (
    RinexDownloadRequest,
    RinexEpochSummaryRead,
    RinexFileHeaderRead,
    RinexFileRead,
    RinexReindexRequest,
    RinexRemoteQueryRequest,
)
from app.services.rinex_service import (
    delete_rinex_file,
    download_rinex_files,
    get_rinex_file,
    list_local_rinex_files,
    query_remote_rinex_files,
    reindex_rinex_files,
)

router = APIRouter(prefix="/rinex-files", tags=["rinex-files"])


@router.get("")
async def list_rinex_files(
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    site_id: int | None = None,
    station_id: str | None = None,
    keyword: str | None = None,
    file_type: str | None = None,
    download_status: str | None = None,
):
    result = list_local_rinex_files(
        db,
        page=page,
        page_size=page_size,
        site_id=site_id,
        station_id=station_id,
        keyword=keyword,
        file_type=file_type,
        download_status=download_status,
    )
    items = [RinexFileRead.model_validate(item) for item in result["items"]]
    return ok(PaginatedItems(items=items, total=result["total"], page=page, page_size=page_size))


@router.post("/query-remote")
async def query_remote(payload: RinexRemoteQueryRequest, db: DBSession):
    try:
        items = await query_remote_rinex_files(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok(items)


@router.post("/download")
async def download(payload: RinexDownloadRequest, db: DBSession):
    return ok(await download_rinex_files(db, payload))


@router.get("/{rinex_file_id}")
async def get_rinex_file_detail(rinex_file_id: int, db: DBSession):
    record = get_rinex_file(db, rinex_file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="RINEX file not found")
    return ok(
        RinexFileRead.model_validate(
            {
                **record.__dict__,
                "site_name": record.site.name if record.site else None,
                "four_char_id": record.site.four_char_id if record.site else record.station_id,
            }
        )
    )


@router.get("/{rinex_file_id}/header")
async def get_rinex_header(rinex_file_id: int, db: DBSession):
    record = get_rinex_file(db, rinex_file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="RINEX file not found")
    return ok(RinexFileHeaderRead(id=record.id, filename=record.filename, header=record.header_json))


@router.get("/{rinex_file_id}/epochs")
async def get_rinex_epochs(rinex_file_id: int, db: DBSession):
    record = get_rinex_file(db, rinex_file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="RINEX file not found")
    return ok(
        RinexEpochSummaryRead(
            id=record.id,
            filename=record.filename,
            start_time=record.start_time,
            end_time=record.end_time,
            sample_interval_seconds=record.sample_interval_seconds,
            file_period=record.file_period,
        )
    )


@router.post("/reindex")
async def reindex(payload: RinexReindexRequest, db: DBSession):
    return ok(reindex_rinex_files(db, payload.ids))


@router.delete("/{rinex_file_id}")
async def remove_rinex_file(rinex_file_id: int, db: DBSession):
    try:
        result = delete_rinex_file(db, rinex_file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ok(result)
