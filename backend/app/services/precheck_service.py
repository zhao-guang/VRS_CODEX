from __future__ import annotations

import math
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.rinex_file import RinexFile
from app.models.site import Site
from app.schemas.solve_jobs import SppPrecheckRequest

GPS_CODES = {"C1C", "C1W", "C1P", "C1S", "C1X", "C1L", "C1M", "C1N"}
GAL_CODES = {"C1C", "C1X", "C1A", "C1B", "C1Z"}
SYSTEM_TO_NAME = {"G": "GPS", "E": "GAL", "C": "BDS", "R": "GLO"}
NAME_TO_SYSTEM = {value: key for key, value in SYSTEM_TO_NAME.items()}


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _read_text_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def _parse_obs_types(header_lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    index = 0
    while index < len(header_lines):
        line = header_lines[index]
        label = line[60:].strip() if len(line) >= 60 else ""
        if label == "SYS / # / OBS TYPES":
            system = line[0]
            count = int((line[3:6] or "0").strip() or "0")
            types = line[7:60].split()
            while len(types) < count and index + 1 < len(header_lines):
                index += 1
                types.extend(header_lines[index][7:60].split())
            result[system] = types[:count]
        elif label == "END OF HEADER":
            break
        index += 1
    return result


def _pick_supported_codes(system: str) -> set[str]:
    if system == "G":
        return GPS_CODES
    if system == "E":
        return GAL_CODES
    return set()


def _count_epoch_satellites(
    path: Path,
    requested_epoch: datetime,
    *,
    search_window_minutes: int,
    selected_constellations: list[str],
    max_candidate_epochs: int,
) -> list[dict[str, Any]]:
    lines = _read_text_lines(path)
    header_end_index = 0
    for idx, line in enumerate(lines):
        label = line[60:].strip() if len(line) >= 60 else ""
        if label == "END OF HEADER":
            header_end_index = idx + 1
            break

    obs_types = _parse_obs_types(lines[:header_end_index])
    enabled_systems = {NAME_TO_SYSTEM[name] for name in selected_constellations if name in NAME_TO_SYSTEM}
    candidates: list[dict[str, Any]] = []
    requested_seconds = requested_epoch.timestamp()
    max_distance = search_window_minutes * 60
    index = header_end_index

    while index < len(lines):
        line = lines[index]
        if not line.startswith(">"):
            index += 1
            continue

        year = int(line[2:6])
        month = int(line[7:9])
        day = int(line[10:12])
        hour = int(line[13:15])
        minute = int(line[16:18])
        second = float(line[19:29])
        epoch_dt = datetime(year, month, day, hour, minute, int(second), tzinfo=UTC)
        epoch_distance = abs(epoch_dt.timestamp() - requested_seconds)
        satellite_count = int((line[32:35] or "0").strip() or "0")
        index += 1

        matched_by_system: dict[str, set[str]] = defaultdict(set)
        for _ in range(satellite_count):
            if index >= len(lines):
                break
            record = lines[index]
            prn = record[:3]
            system = prn[:1]
            types = obs_types.get(system, [])
            required_lines = int(math.ceil((3 + len(types) * 16) / 80)) if types else 1
            full_record = record
            for extra in range(1, required_lines):
                if index + extra < len(lines):
                    full_record += lines[index + extra].ljust(80)
            index += required_lines

            if system not in enabled_systems:
                continue
            supported_codes = _pick_supported_codes(system)
            if not supported_codes or not types:
                continue

            has_pseudorange = False
            for obs_index, code in enumerate(types):
                if code not in supported_codes:
                    continue
                start = 3 + obs_index * 16
                value = full_record[start : start + 14].strip() if start + 14 <= len(full_record) else ""
                if value:
                    has_pseudorange = True
                    break
            if has_pseudorange:
                matched_by_system[SYSTEM_TO_NAME[system]].add(prn)

        if epoch_distance <= max_distance:
            per_system_counts = {system: len(prns) for system, prns in matched_by_system.items()}
            matched_satellites = sorted({prn for prns in matched_by_system.values() for prn in prns})
            total = sum(per_system_counts.values())
            candidates.append(
                {
                    "epochTime": epoch_dt.isoformat().replace("+00:00", "Z"),
                    "offsetSeconds": epoch_distance,
                    "totalSatellites": total,
                    "perSystemCounts": dict(per_system_counts),
                    "satellites": matched_satellites[:12],
                }
            )

    candidates.sort(key=lambda item: (item["offsetSeconds"], -item["totalSatellites"]))
    return candidates[:max_candidate_epochs]


def _collect_nav_systems(nav_files: list[RinexFile]) -> list[str]:
    systems: set[str] = set()
    for nav_file in nav_files:
        if not nav_file.local_path:
            continue
        path = Path(nav_file.local_path)
        if not path.exists():
            continue
        for line in _read_text_lines(path):
            if line.startswith(("G", "E", "C", "R")):
                system = SYSTEM_TO_NAME.get(line[0])
                if system:
                    systems.add(system)
        if systems:
            continue
    return sorted(systems)


def run_spp_precheck(db: Session, request: SppPrecheckRequest) -> dict[str, Any]:
    site = db.get(Site, request.site_id)
    if site is None or site.is_deleted:
        raise ValueError("Site not found.")

    obs_file = db.get(RinexFile, request.observation_file_id)
    if obs_file is None or not obs_file.local_path:
        raise ValueError("Observation RINEX file is not downloaded locally.")

    nav_files: list[RinexFile] = []
    for nav_file_id in request.navigation_file_ids:
        nav_file = db.get(RinexFile, nav_file_id)
        if nav_file is None:
            raise ValueError(f"Navigation RINEX file not found: {nav_file_id}")
        if nav_file.file_type != "nav" or not nav_file.local_path:
            raise ValueError(f"Navigation RINEX file is not available locally: {nav_file_id}")
        nav_files.append(nav_file)

    requested_epoch = _normalize_datetime(request.epoch_time)
    candidate_epochs = _count_epoch_satellites(
        Path(obs_file.local_path),
        requested_epoch,
        search_window_minutes=request.search_window_minutes,
        selected_constellations=request.constellations,
        max_candidate_epochs=request.max_candidate_epochs,
    )
    available_nav_systems = _collect_nav_systems(nav_files)

    reasons: list[str] = []
    status = "unavailable"
    recommendation = "不建议直接提交，建议先调整时刻、星座或观测文件。"
    nearest_candidate = candidate_epochs[0] if candidate_epochs else None
    if not nav_files:
        reasons.append("未选择本地导航文件。")

    missing_nav_systems = [name for name in request.constellations if name not in available_nav_systems]
    if missing_nav_systems:
        reasons.append(f"导航文件未覆盖所选星座: {', '.join(missing_nav_systems)}。")

    if not candidate_epochs:
        reasons.append("请求时刻附近未发现满足当前预检规则的候选历元。")
    elif nearest_candidate:
        if nearest_candidate["totalSatellites"] < 4:
            reasons.append("请求时刻附近可用伪距卫星数量不足 4。")
        if nearest_candidate["offsetSeconds"] > 600:
            reasons.append("最近可用历元与请求时刻相差超过 10 分钟。")

    if candidate_epochs and nearest_candidate and not missing_nav_systems and nearest_candidate["totalSatellites"] >= 4:
        if nearest_candidate["offsetSeconds"] <= 300:
            status = "ready"
            recommendation = "可以提交解算，当前请求时刻附近具备基本可用性。"
        else:
            status = "risky"
            recommendation = "可以尝试提交，但建议优先靠近候选历元时刻。"
    elif candidate_epochs:
        status = "risky"
        recommendation = "当前配置存在一定风险，建议先根据预检结果调整。"

    return {
        "status": status,
        "recommendation": recommendation,
        "requestedEpochTime": requested_epoch,
        "searchWindowMinutes": request.search_window_minutes,
        "selectedConstellations": request.constellations,
        "observationFileId": request.observation_file_id,
        "navigationFileIds": request.navigation_file_ids,
        "availableNavSystems": available_nav_systems,
        "nearestCandidateEpochTime": (
            datetime.fromisoformat(nearest_candidate["epochTime"].replace("Z", "+00:00")) if nearest_candidate else None
        ),
        "nearestCandidateOffsetSeconds": nearest_candidate["offsetSeconds"] if nearest_candidate else None,
        "candidateEpochCount": len(candidate_epochs),
        "reasons": reasons,
        "candidateEpochs": candidate_epochs,
    }
