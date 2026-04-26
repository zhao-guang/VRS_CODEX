from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.import_batch import ImportBatch
from app.models.network import Network
from app.models.site import Site


def get_bootstrap_status(db: Session) -> dict:
    latest_batch = db.scalar(select(ImportBatch).order_by(ImportBatch.created_at.desc()))
    network_count = db.scalar(select(func.count(Network.id)).where(Network.is_deleted.is_(False))) or 0
    site_count = db.scalar(select(func.count(Site.id)).where(Site.is_deleted.is_(False))) or 0

    return {
        "bootstrapped": latest_batch is not None and latest_batch.status == "succeeded",
        "latest_batch": {
            "id": latest_batch.id,
            "source": latest_batch.source,
            "status": latest_batch.status,
            "total_networks": latest_batch.total_networks,
            "total_sites": latest_batch.total_sites,
            "created_at": latest_batch.created_at,
        }
        if latest_batch
        else None,
        "counts": {
            "networks": network_count,
            "sites": site_count,
        },
    }
