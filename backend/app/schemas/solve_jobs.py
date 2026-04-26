from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class SppModels(BaseModel):
    ionosphere: str = "broadcast"
    troposphere: str = "saastamoinen"
    earth_rotation: bool = Field(default=True, alias="earthRotation")
    relativity: bool = True


class SppSolveRequest(BaseModel):
    site_id: int = Field(alias="siteId")
    observation_file_id: int = Field(alias="observationFileId")
    navigation_file_ids: list[int] = Field(default_factory=list, alias="navigationFileIds")
    epoch_time: datetime = Field(alias="epochTime")
    constellations: list[str] = Field(default_factory=lambda: ["GPS", "BDS", "GAL", "GLO"])
    elevation_mask_deg: float = Field(default=10.0, alias="elevationMaskDeg")
    models: SppModels = Field(default_factory=SppModels)


class SolveJobRead(ORMModel):
    id: int
    job_type: str
    status: str
    request_json: dict
    solver_job_id: str | None
    started_at: datetime | None
    finished_at: datetime | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    engine: str | None = None
    summary: dict | None = None


class SolveResultRead(BaseModel):
    job_id: int
    engine: str
    summary: dict
    quality: dict


class SolutionEpochRead(ORMModel):
    id: int
    job_id: int
    epoch_time: datetime
    site_role: str
    solution_status: str
    x: float | None
    y: float | None
    z: float | None
    latitude: float | None
    longitude: float | None
    height: float | None
    pdop: float | None
    hdop: float | None
    vdop: float | None
    nsat_used: int | None
    sigma0: float | None
    residual_summary_json: dict | None


class SatelliteStateRead(ORMModel):
    id: int
    job_id: int
    epoch_time: datetime
    satellite_system: str
    satellite_prn: str
    elevation_deg: float | None
    azimuth_deg: float | None
    snr: float | None
    used_in_solution: bool
    health_status: str
    cycle_slip_detected: bool
    residual_code: float | None
    residual_phase: float | None
