from __future__ import annotations

import gzip
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.rinex_file import RinexFile
from app.models.site import Site
from app.schemas.rinex import RinexDownloadRequest, RinexRemoteFile, RinexRemoteQueryRequest


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _filename_from_url(url: str) -> str:
    return Path(urlparse(url).path).name


def _file_is_gzip(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 2:
        return False
    with path.open("rb") as stream:
        return stream.read(2) == b"\x1f\x8b"


def _compression_type(filename: str, path: Path | None = None) -> str:
    if path is not None and not _file_is_gzip(path):
        return "none"
    lower = filename.lower()
    if lower.endswith(".crx.gz"):
        return "crx.gz"
    if lower.endswith(".rnx.gz") or lower.endswith(".d.gz") or lower.endswith(".o.gz") or lower.endswith(".gz"):
        return "gz"
    if lower.endswith(".zip"):
        return "zip"
    if lower.endswith(".crx"):
        return "crx"
    return "none"


def _period_to_timedelta(file_period: str | None) -> timedelta | None:
    mapping = {
        "15M": timedelta(minutes=15),
        "01H": timedelta(hours=1),
        "01D": timedelta(days=1),
    }
    return mapping.get(file_period or "")


def _open_text_stream(path: Path):
    if _file_is_gzip(path):
        return gzip.open(path, mode="rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def _parse_header(path: Path) -> dict[str, Any]:
    header_lines: list[str] = []
    observation_types: dict[str, list[str]] = {}
    constellations: set[str] = set()
    rinex_version: str | None = None
    sample_interval_seconds: float | None = None
    time_of_first_obs: datetime | None = None
    time_of_last_obs: datetime | None = None

    with _open_text_stream(path) as stream:
        continuation_system: str | None = None
        for raw_line in stream:
            line = raw_line.rstrip("\n")
            header_lines.append(line)
            label = line[60:].strip() if len(line) >= 60 else ""

            if "RINEX VERSION / TYPE" in label:
                rinex_version = line[:9].strip() or None
            elif label == "INTERVAL":
                try:
                    sample_interval_seconds = float(line[:10].strip())
                except ValueError:
                    sample_interval_seconds = None
            elif label == "TIME OF FIRST OBS":
                parts = line[:43].split()
                if len(parts) >= 6:
                    year, month, day, hour, minute = map(int, parts[:5])
                    second = float(parts[5])
                    microseconds = int((second % 1) * 1_000_000)
                    time_of_first_obs = datetime(
                        year, month, day, hour, minute, int(second), microseconds, tzinfo=UTC
                    )
            elif label == "TIME OF LAST OBS":
                parts = line[:43].split()
                if len(parts) >= 6:
                    year, month, day, hour, minute = map(int, parts[:5])
                    second = float(parts[5])
                    microseconds = int((second % 1) * 1_000_000)
                    time_of_last_obs = datetime(
                        year, month, day, hour, minute, int(second), microseconds, tzinfo=UTC
                    )
            elif label == "SYS / # / OBS TYPES":
                system = line[0].strip()
                constellations.add(system)
                obs_section = line[7:60].split()
                observation_types.setdefault(system, []).extend(obs_section)
                continuation_system = system
            elif label == "# / TYPES OF OBSERV":
                system = "M"
                constellations.add(system)
                obs_section = line[6:60].split()
                observation_types.setdefault(system, []).extend(obs_section)
                continuation_system = system
            elif not label and continuation_system and len(line) >= 6 and line[:6].strip():
                # Ignore generic continuation unless a header label indicates continuation.
                continuation_system = continuation_system
            elif label == "END OF HEADER":
                break

    return {
        "header_lines": header_lines[:120],
        "rinex_version": rinex_version,
        "sample_interval_seconds": sample_interval_seconds,
        "time_of_first_obs": time_of_first_obs.isoformat() if time_of_first_obs else None,
        "time_of_last_obs": time_of_last_obs.isoformat() if time_of_last_obs else None,
        "constellations": sorted(constellations),
        "observation_types": observation_types,
    }


def _index_rinex_file(record: RinexFile) -> RinexFile:
    if not record.local_path:
        record.index_status = "failed"
        record.last_error = "Local path is missing."
        return record

    path = Path(record.local_path)
    if not path.exists():
        record.index_status = "failed"
        record.last_error = f"File does not exist: {record.local_path}"
        return record

    try:
        header = _parse_header(path)
        record.header_json = header
        record.index_status = "indexed"
        record.last_error = None
        record.rinex_version = record.rinex_version or header.get("rinex_version")
        record.sample_interval_seconds = header.get("sample_interval_seconds")
        record.constellations_json = header.get("constellations")
        record.observation_types_json = header.get("observation_types")
        if header.get("time_of_first_obs"):
            record.start_time = _parse_datetime(header["time_of_first_obs"])
        if header.get("time_of_last_obs"):
            record.end_time = _parse_datetime(header["time_of_last_obs"])
        return record
    except Exception as exc:  # noqa: BLE001
        record.index_status = "failed"
        record.last_error = str(exc)
        return record


async def query_remote_rinex_files(db: Session, request: RinexRemoteQueryRequest) -> list[dict[str, Any]]:
    station_ids = {station_id.upper() for station_id in request.station_ids if station_id}
    if request.site_ids:
        sites = db.scalars(select(Site).where(Site.id.in_(request.site_ids), Site.is_deleted.is_(False))).all()
        station_ids.update(site.four_char_id.upper() for site in sites if site.four_char_id)

    if not station_ids:
        raise ValueError("At least one siteId or stationId is required.")

    params = {
        "stationId": ",".join(sorted(station_ids)),
        "startDate": request.start_date.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "endDate": request.end_date.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "filePeriod": ",".join(request.file_period),
        "fileType": ",".join(request.file_type),
        "rinexVersion": ",".join(request.rinex_version),
        "metadataStatus": request.metadata_status,
        "decompress": str(request.decompress).lower(),
    }

    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds, follow_redirects=True) as client:
        response = await client.get("https://data.gnss.ga.gov.au/api/rinexFiles", params=params)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        payload = response.json()

    items: list[dict[str, Any]] = []
    for raw_item in payload:
        file_location = raw_item["fileLocation"]
        item = RinexRemoteFile.model_validate({**raw_item, "filename": _filename_from_url(file_location)})
        items.append(item.model_dump(mode="json", by_alias=True))
    return items


async def download_rinex_files(db: Session, request: RinexDownloadRequest) -> dict[str, Any]:
    settings.rinex_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[dict[str, Any]] = []

    for item in request.items:
        station_id = item.station_id.upper()
        site = db.scalar(
            select(Site).where(func.upper(Site.four_char_id) == station_id, Site.is_deleted.is_(False))
        )
        site_dir = settings.rinex_dir / station_id
        site_dir.mkdir(parents=True, exist_ok=True)
        local_path = site_dir / item.filename

        existing = db.scalar(select(RinexFile).where(RinexFile.remote_file_id == item.remote_file_id))
        if existing and existing.local_path and Path(existing.local_path).exists() and not request.overwrite:
            downloaded.append({"id": existing.id, "filename": existing.filename, "status": "skipped"})
            continue

        async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
            async with client.stream("GET", item.remote_url) as response:
                response.raise_for_status()
                with local_path.open("wb") as output:
                    async for chunk in response.aiter_bytes():
                        output.write(chunk)

        if existing is None:
            record = RinexFile(
                site_id=site.id if site else None,
                station_id=station_id,
                source="ga_remote",
                remote_file_id=item.remote_file_id,
                remote_url=item.remote_url,
                filename=item.filename,
            )
            db.add(record)
        else:
            record = existing

        record.site_id = site.id if site else record.site_id
        record.station_id = station_id
        record.remote_url = item.remote_url
        record.filename = item.filename
        record.local_path = str(local_path)
        record.file_type = item.file_type
        record.file_period = item.file_period
        record.rinex_version = item.rinex_version
        record.compression_type = _compression_type(item.filename, local_path)
        record.file_size = item.file_size or local_path.stat().st_size
        record.download_status = "downloaded"
        record.metadata_status = item.metadata_status
        record.start_time = item.start_date
        period_delta = _period_to_timedelta(item.file_period)
        record.end_time = item.start_date + period_delta if item.start_date and period_delta else record.end_time
        record.index_status = "pending"
        record.last_error = None

        if request.auto_index:
            _index_rinex_file(record)

        db.flush()
        downloaded.append({"id": record.id, "filename": record.filename, "status": record.download_status})

    db.commit()
    return {"items": downloaded}


def list_local_rinex_files(
    db: Session,
    *,
    page: int,
    page_size: int,
    site_id: int | None = None,
    keyword: str | None = None,
    file_type: str | None = None,
    download_status: str | None = None,
    station_id: str | None = None,
) -> dict[str, Any]:
    query = select(RinexFile, Site.name, Site.four_char_id).outerjoin(Site, RinexFile.site_id == Site.id)
    total_query = select(func.count(RinexFile.id))

    filters = []
    if site_id:
        filters.append(RinexFile.site_id == site_id)
    if station_id:
        filters.append(func.upper(RinexFile.station_id) == station_id.upper())
    if keyword:
        predicate = or_(
            RinexFile.filename.ilike(f"%{keyword}%"),
            RinexFile.station_id.ilike(f"%{keyword}%"),
        )
        filters.append(predicate)
    if file_type:
        filters.append(RinexFile.file_type == file_type)
    if download_status:
        filters.append(RinexFile.download_status == download_status)

    for filter_clause in filters:
        query = query.where(filter_clause)
        total_query = total_query.where(filter_clause)

    total = db.scalar(total_query) or 0
    rows = db.execute(
        query.order_by(RinexFile.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = []
    for rinex_file, site_name, four_char_id in rows:
        items.append(
            {
                **rinex_file.__dict__,
                "site_name": site_name,
                "four_char_id": four_char_id or rinex_file.station_id,
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_rinex_file(db: Session, rinex_file_id: int) -> RinexFile | None:
    return db.get(RinexFile, rinex_file_id)


def reindex_rinex_files(db: Session, ids: list[int]) -> dict[str, Any]:
    items = db.scalars(select(RinexFile).where(RinexFile.id.in_(ids))).all()
    updated = []
    for item in items:
        _index_rinex_file(item)
        updated.append({"id": item.id, "index_status": item.index_status, "filename": item.filename})
    db.commit()
    return {"items": updated}


def delete_rinex_file(db: Session, rinex_file_id: int) -> dict[str, Any]:
    record = db.get(RinexFile, rinex_file_id)
    if record is None:
        raise ValueError("RINEX file not found.")
    if record.local_path:
        path = Path(record.local_path)
        if path.exists():
            path.unlink()
    db.delete(record)
    db.commit()
    return {"deleted": True, "id": rinex_file_id}
