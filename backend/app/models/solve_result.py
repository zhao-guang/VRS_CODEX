from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.solve_job import SolveJob


class SolveResult(TimestampMixin, Base):
    __tablename__ = "solve_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("solve_jobs.id", ondelete="CASCADE"), unique=True, index=True)
    engine: Mapped[str] = mapped_column(String(64), default="solver_stub")
    summary_json: Mapped[dict] = mapped_column(JSON, default=dict)
    quality_json: Mapped[dict] = mapped_column(JSON, default=dict)
    raw_response_json: Mapped[dict] = mapped_column(JSON, default=dict)

    job: Mapped["SolveJob"] = relationship(back_populates="result")
