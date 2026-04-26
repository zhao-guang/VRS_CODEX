from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.import_batch import ImportBatch
    from app.models.membership import NetworkSiteMembership


class Site(TimestampMixin, Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_type: Mapped[str] = mapped_column(String(32), default="local", index=True)
    external_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    four_char_id: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    domes_number: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipsoidal_height: Mapped[float | None] = mapped_column(Float, nullable=True)
    date_installed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    site_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    monument_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    monument_foundation: Mapped[str | None] = mapped_column(Text, nullable=True)
    marker_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    monument_height: Mapped[str | None] = mapped_column(String(32), nullable=True)
    geologic_characteristic: Mapped[str | None] = mapped_column(Text, nullable=True)
    bedrock_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id"), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    last_import_batch: Mapped["ImportBatch | None"] = relationship()
    memberships: Mapped[list["NetworkSiteMembership"]] = relationship(
        back_populates="site",
        cascade="all, delete-orphan",
    )
