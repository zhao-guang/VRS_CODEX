from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ApproximatePosition(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    ellipsoidal_height: float | None = Field(default=None, alias="ellipsoidalHeight")


class MonumentPayload(BaseModel):
    description: str | None = None
    foundation: str | None = None
    marker_description: str | None = Field(default=None, alias="markerDescription")
    height: str | None = None


class SiteCreate(BaseModel):
    name: str | None = None
    four_char_id: str | None = Field(default=None, alias="fourCharId")
    domes_number: str | None = Field(default=None, alias="domesNumber")
    description: str | None = None
    approximate_position: ApproximatePosition | None = Field(default=None, alias="approximatePosition")
    date_installed: datetime | None = Field(default=None, alias="dateInstalled")
    site_status: str | None = Field(default=None, alias="siteStatus")
    monument: MonumentPayload | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    four_char_id: str | None = Field(default=None, alias="fourCharId")
    domes_number: str | None = Field(default=None, alias="domesNumber")
    description: str | None = None
    approximate_position: ApproximatePosition | None = Field(default=None, alias="approximatePosition")
    date_installed: datetime | None = Field(default=None, alias="dateInstalled")
    site_status: str | None = Field(default=None, alias="siteStatus")
    monument: MonumentPayload | None = None


class SiteNetworkRead(ORMModel):
    id: int
    name: str
    status: str


class SiteRead(ORMModel):
    id: int
    source_type: str
    external_id: int | None
    name: str | None
    four_char_id: str | None
    domes_number: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    ellipsoidal_height: float | None
    date_installed: datetime | None
    site_status: str | None
    monument_description: str | None
    monument_foundation: str | None
    marker_description: str | None
    monument_height: str | None
    geologic_characteristic: str | None
    bedrock_type: str | None
    networks: list[SiteNetworkRead] = []
    created_at: datetime
    updated_at: datetime


class ObservationSummary(BaseModel):
    site_id: int
    start_time: datetime | None = None
    end_time: datetime | None = None
    local_file_count: int = 0
    remote_file_count: int = 0
    coverage_ratio: float = 0.0
    gaps: list[dict] = []
