from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class APIEnvelope(BaseModel, Generic[T]):
    code: str = "OK"
    message: str = "success"
    data: T
    meta: dict = Field(default_factory=dict)


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int


class PaginatedItems(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
