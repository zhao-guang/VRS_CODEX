from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.network import Network
    from app.models.site import Site


class NetworkSiteMembership(TimestampMixin, Base):
    __tablename__ = "network_site_memberships"
    __table_args__ = (
        UniqueConstraint("network_id", "site_id", "valid_from", name="uq_network_site_valid_from"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_type: Mapped[str] = mapped_column(String(32), default="local")

    network: Mapped["Network"] = relationship(back_populates="memberships")
    site: Mapped["Site"] = relationship(back_populates="memberships")
