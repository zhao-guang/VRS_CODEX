from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.site import Site


class RinexFile(TimestampMixin, Base):
    __tablename__ = "rinex_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True, index=True)
    station_id: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="ga_remote", index=True)
    remote_file_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    remote_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    filename: Mapped[str] = mapped_column(String(512), index=True)
    local_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_type: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    file_period: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    rinex_version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    compression_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sample_interval_seconds: Mapped[float | None] = mapped_column(nullable=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    file_size: Mapped[int | None] = mapped_column(nullable=True)
    download_status: Mapped[str] = mapped_column(String(32), default="downloaded", index=True)
    index_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    metadata_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    constellations_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    observation_types_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    header_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    site: Mapped["Site | None"] = relationship()
