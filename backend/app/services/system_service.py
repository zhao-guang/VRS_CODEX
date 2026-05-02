from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.import_batch import ImportBatch
from app.models.network import Network
from app.models.site import Site


def get_bootstrap_status(db: Session) -> dict:
    latest_batch = db.scalar(select(ImportBatch).order_by(ImportBatch.created_at.desc()))
    latest_successful_batch = db.scalar(
        select(ImportBatch)
        .where(ImportBatch.source == "npi", ImportBatch.status == "succeeded")
        .order_by(ImportBatch.created_at.desc())
    )
    network_count = db.scalar(select(func.count(Network.id)).where(Network.is_deleted.is_(False))) or 0
    site_count = db.scalar(select(func.count(Site.id)).where(Site.is_deleted.is_(False))) or 0
    target_networks = latest_successful_batch.total_networks if latest_successful_batch else (latest_batch.total_networks if latest_batch else 0)
    target_sites = latest_successful_batch.total_sites if latest_successful_batch else (latest_batch.total_sites if latest_batch else 0)
    remaining_networks = max(target_networks - network_count, 0)
    remaining_sites = max(target_sites - site_count, 0)

    return {
        "bootstrapped": bool(latest_successful_batch) and remaining_networks == 0 and remaining_sites == 0,
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
        "progress": {
            "networks": {
                "completed": network_count,
                "total": target_networks,
                "remaining": remaining_networks,
            },
            "sites": {
                "completed": site_count,
                "total": target_sites,
                "remaining": remaining_sites,
            },
        },
    }
