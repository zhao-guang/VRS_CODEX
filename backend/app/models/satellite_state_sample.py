from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.solve_job import SolveJob


class SatelliteStateSample(TimestampMixin, Base):
    __tablename__ = "satellite_state_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("solve_jobs.id", ondelete="CASCADE"), index=True)
    epoch_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    satellite_system: Mapped[str] = mapped_column(String(16), index=True)
    satellite_prn: Mapped[str] = mapped_column(String(16), index=True)
    elevation_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    azimuth_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    snr: Mapped[float | None] = mapped_column(Float, nullable=True)
    used_in_solution: Mapped[bool] = mapped_column(Boolean, default=True)
    health_status: Mapped[str] = mapped_column(String(32), default="healthy")
    cycle_slip_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    residual_code: Mapped[float | None] = mapped_column(Float, nullable=True)
    residual_phase: Mapped[float | None] = mapped_column(Float, nullable=True)

    job: Mapped["SolveJob"] = relationship(back_populates="satellites")
