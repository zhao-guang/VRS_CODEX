from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.satellite_state_sample import SatelliteStateSample
    from app.models.solution_epoch import SolutionEpoch
    from app.models.solve_result import SolveResult


class SolveJob(TimestampMixin, Base):
    __tablename__ = "solve_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    request_json: Mapped[dict] = mapped_column(JSON, default=dict)
    solver_job_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    result: Mapped["SolveResult | None"] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        uselist=False,
    )
    epochs: Mapped[list["SolutionEpoch"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
    )
    satellites: Mapped[list["SatelliteStateSample"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
    )
