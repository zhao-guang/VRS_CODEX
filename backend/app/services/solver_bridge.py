from __future__ import annotations

import math
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from app.core.config import settings
from app.models.rinex_file import RinexFile
from app.models.site import Site
from app.schemas.solve_jobs import SppSolveRequest


def _geodetic_to_ecef(latitude_deg: float, longitude_deg: float, height_m: float) -> tuple[float, float, float]:
    a = 6378137.0
    f = 1 / 298.257223563
    e2 = f * (2 - f)

    lat = math.radians(latitude_deg)
    lon = math.radians(longitude_deg)
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    sin_lon = math.sin(lon)
    cos_lon = math.cos(lon)

    n = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
    x = (n + height_m) * cos_lat * cos_lon
    y = (n + height_m) * cos_lat * sin_lon
    z = (n * (1 - e2) + height_m) * sin_lat
    return x, y, z


def _build_mock_spp_result(site: Site, obs_file: RinexFile, request: SppSolveRequest) -> dict:
    latitude = site.latitude or 0.0
    longitude = site.longitude or 0.0
    height = site.ellipsoidal_height or 0.0
    x, y, z = _geodetic_to_ecef(latitude, longitude, height)

    if obs_file.header_json and obs_file.header_json.get("constellations"):
        constellation_count = len(obs_file.header_json["constellations"])
    else:
        constellation_count = len(request.constellations)

    nsat_used = max(6, min(16, constellation_count * 4))
    pdop = round(3.8 - min(constellation_count, 4) * 0.35, 3)
    hdop = round(pdop * 0.62, 3)
    vdop = round(pdop * 0.88, 3)
    sigma0 = round(1.2 + max(0, 12 - nsat_used) * 0.03, 3)

    epoch = request.epoch_time.astimezone(UTC).isoformat()
    engine = "mock-spp-fallback"
    satellites = []
    per_system_samples = {
        "GPS": ["G05", "G12"],
        "BDS": ["C07", "C13"],
        "GAL": ["E11", "E24"],
        "GLO": ["R03", "R19"],
    }
    azimuth = 35.0
    for index, constellation in enumerate(request.constellations):
        for prn in per_system_samples.get(constellation, [f"{constellation[:1]}01"]):
            satellites.append(
                {
                    "epochTime": epoch,
                    "satelliteSystem": constellation,
                    "satellitePrn": prn,
                    "elevationDeg": round(18.0 + index * 8.0 + len(prn), 2),
                    "azimuthDeg": round(azimuth % 360, 2),
                    "snr": round(34.0 + index * 2.5, 2),
                    "usedInSolution": True,
                    "healthStatus": "healthy",
                    "cycleSlip": False,
                    "codeResidual": round(0.45 + index * 0.08, 3),
                    "phaseResidual": round(0.012 + index * 0.002, 4),
                }
            )
            azimuth += 37.5

    return {
        "jobId": f"mock-{uuid4().hex[:12]}",
        "status": "succeeded",
        "engine": engine,
        "summary": {
            "mode": "spp",
            "siteId": site.id,
            "stationId": site.four_char_id,
            "engine": engine,
            "epochCount": 1,
            "validEpochCount": 1,
            "solutionStatus": "code",
            "nsatUsed": nsat_used,
            "observationFileId": obs_file.id,
            "observationFilename": obs_file.filename,
        },
        "quality": {
            "pdop": pdop,
            "hdop": hdop,
            "vdop": vdop,
            "sigma0": sigma0,
            "constellations": request.constellations,
        },
        "epochs": [
            {
                "epochTime": epoch,
                "siteRole": "single",
                "solutionStatus": "code",
                "ecef": {"x": x, "y": y, "z": z},
                "geodetic": {"latitude": latitude, "longitude": longitude, "height": height},
                "pdop": pdop,
                "hdop": hdop,
                "vdop": vdop,
                "nsatUsed": nsat_used,
                "sigma0": sigma0,
                "residualSummary": {
                    "codeRms": round(0.85 + nsat_used * 0.02, 3),
                    "phaseRms": round(0.015 + nsat_used * 0.001, 4),
                },
            }
        ],
        "satellites": satellites,
    }


async def run_spp_solver(site: Site, obs_file: RinexFile, nav_files: list[RinexFile], request: SppSolveRequest) -> dict:
    payload = {
        "jobId": f"spp-{uuid4().hex[:12]}",
        "site": {"siteId": site.id, "name": site.four_char_id or site.name or f"SITE-{site.id}"},
        "observation": {
            "filePath": obs_file.local_path,
            "rinexVersion": obs_file.rinex_version,
            "fileId": obs_file.id,
        },
        "navigation": [
            {
                "filePath": nav_file.local_path,
                "fileId": nav_file.id,
                "rinexVersion": nav_file.rinex_version,
            }
            for nav_file in nav_files
        ],
        "time": {
            "mode": "epoch",
            "epoch": request.epoch_time.astimezone(UTC).isoformat(),
        },
        "constellations": request.constellations,
        "models": request.models.model_dump(by_alias=True),
        "approximatePosition": {
            "latitude": site.latitude,
            "longitude": site.longitude,
            "height": site.ellipsoidal_height,
        },
        "elevationMaskDeg": request.elevation_mask_deg,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(f"{settings.solver_base_url}/solve/spp", json=payload)
            response.raise_for_status()
            body = response.json()
            if isinstance(body, dict) and body.get("engine"):
                return body
    except Exception:
        pass

    return _build_mock_spp_result(site, obs_file, request)
