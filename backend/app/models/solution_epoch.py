from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.solve_job import SolveJob


class SolutionEpoch(TimestampMixin, Base):
    __tablename__ = "solution_epochs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("solve_jobs.id", ondelete="CASCADE"), index=True)
    epoch_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    site_role: Mapped[str] = mapped_column(String(32), default="single")
    solution_status: Mapped[str] = mapped_column(String(32), default="code")
    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)
    z: Mapped[float | None] = mapped_column(Float, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    pdop: Mapped[float | None] = mapped_column(Float, nullable=True)
    hdop: Mapped[float | None] = mapped_column(Float, nullable=True)
    vdop: Mapped[float | None] = mapped_column(Float, nullable=True)
    nsat_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sigma0: Mapped[float | None] = mapped_column(Float, nullable=True)
    residual_summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    job: Mapped["SolveJob"] = relationship(back_populates="epochs")
