from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class RinexRemoteQueryRequest(BaseModel):
    site_ids: list[int] = Field(default_factory=list, alias="siteIds")
    station_ids: list[str] = Field(default_factory=list, alias="stationIds")
    start_date: datetime = Field(alias="startDate")
    end_date: datetime = Field(alias="endDate")
    file_period: list[str] = Field(default_factory=lambda: ["01D"], alias="filePeriod")
    file_type: list[str] = Field(default_factory=lambda: ["obs"], alias="fileType")
    rinex_version: list[str] = Field(default_factory=lambda: ["2", "3", "4"], alias="rinexVersion")
    metadata_status: str = Field(default="valid", alias="metadataStatus")
    decompress: bool = True


class RinexRemoteFile(BaseModel):
    site_id: str = Field(alias="siteId")
    file_type: str = Field(alias="fileType")
    file_period: str = Field(alias="filePeriod")
    start_date: datetime = Field(alias="startDate")
    rinex_version: str = Field(alias="rinexVersion")
    file_location: str = Field(alias="fileLocation")
    metadata_status: str = Field(alias="metadataStatus")
    file_size: int | None = Field(default=None, alias="fileSize")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    modified_at: datetime | None = Field(default=None, alias="modifiedAt")
    file_id: str = Field(alias="fileId")
    metadata_errors: list[dict] = Field(default_factory=list, alias="metadataErrors")
    filename: str


class RinexDownloadItem(BaseModel):
    station_id: str = Field(alias="stationId")
    remote_file_id: str = Field(alias="remoteFileId")
    remote_url: str = Field(alias="remoteUrl")
    filename: str
    file_type: str = Field(alias="fileType")
    file_period: str = Field(alias="filePeriod")
    rinex_version: str = Field(alias="rinexVersion")
    metadata_status: str = Field(alias="metadataStatus")
    start_date: datetime | None = Field(default=None, alias="startDate")
    file_size: int | None = Field(default=None, alias="fileSize")


class RinexDownloadRequest(BaseModel):
    items: list[RinexDownloadItem]
    overwrite: bool = False
    auto_index: bool = Field(default=True, alias="autoIndex")


class RinexReindexRequest(BaseModel):
    ids: list[int]


class RinexFileRead(ORMModel):
    id: int
    site_id: int | None
    station_id: str | None
    source: str
    remote_file_id: str | None
    remote_url: str | None
    filename: str
    local_path: str | None
    file_type: str | None
    file_period: str | None
    rinex_version: str | None
    compression_type: str | None
    sample_interval_seconds: float | None
    start_time: datetime | None
    end_time: datetime | None
    file_size: int | None
    download_status: str
    index_status: str
    metadata_status: str | None
    constellations_json: list | None
    observation_types_json: dict | None
    header_json: dict | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
    site_name: str | None = None
    four_char_id: str | None = None


class RinexFileHeaderRead(BaseModel):
    id: int
    filename: str
    header: dict | None


class RinexEpochSummaryRead(BaseModel):
    id: int
    filename: str
    start_time: datetime | None
    end_time: datetime | None
    sample_interval_seconds: float | None
    file_period: str | None
