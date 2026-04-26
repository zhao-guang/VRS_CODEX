from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class NetworkBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str = "active"


class NetworkCreate(NetworkBase):
    pass


class NetworkUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = None


class MembershipBindRequest(BaseModel):
    site_ids: list[int]
    valid_from: datetime | None = None
    valid_to: datetime | None = None


class NetworkRead(ORMModel):
    id: int
    source_type: str
    external_id: int | None
    name: str
    description: str | None
    status: str
    site_count: int = 0
    created_at: datetime
    updated_at: datetime
