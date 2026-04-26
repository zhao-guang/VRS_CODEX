from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.network import Network
from app.models.site import Site
from app.services.npi_service import _fetch_paginated_collection, bootstrap_npi_data


async def build_npi_preview(db: Session, *, networks_url: str, sites_url: str) -> dict[str, Any]:
    remote_networks = await _fetch_paginated_collection(networks_url, "corsNetworks")
    remote_sites = await _fetch_paginated_collection(sites_url, "corsSites")

    local_networks = {
        network.external_id: network
        for network in db.scalars(select(Network).where(Network.source_type == "npi_seed")).all()
        if network.external_id is not None
    }
    local_sites = {
        site.external_id: site
        for site in db.scalars(select(Site).where(Site.source_type == "npi_seed")).all()
        if site.external_id is not None
    }

    remote_network_ids = {item["id"] for item in remote_networks}
    remote_site_ids = {item["id"] for item in remote_sites}

    added_networks = [item for item in remote_networks if item["id"] not in local_networks]
    removed_networks = [
        {"id": external_id, "name": local_networks[external_id].name}
        for external_id in local_networks
        if external_id not in remote_network_ids
    ]
    updated_networks = []
    for item in remote_networks:
        local = local_networks.get(item["id"])
        if local and ((local.name or "") != (item.get("name") or "") or (local.description or "") != (item.get("description") or "")):
            updated_networks.append(
                {
                    "id": item["id"],
                    "before": {"name": local.name, "description": local.description},
                    "after": {"name": item.get("name"), "description": item.get("description")},
                }
            )

    added_sites = [item for item in remote_sites if item["id"] not in local_sites]
    removed_sites = [
        {"id": external_id, "four_char_id": local_sites[external_id].four_char_id}
        for external_id in local_sites
        if external_id not in remote_site_ids
    ]
    updated_sites = []
    for item in remote_sites:
        local = local_sites.get(item["id"])
        if not local:
            continue
        remote_name = item.get("name") or None
        remote_four_char = item.get("fourCharacterId")
        if local.name != remote_name or local.four_char_id != remote_four_char:
            updated_sites.append(
                {
                    "id": item["id"],
                    "before": {"name": local.name, "four_char_id": local.four_char_id},
                    "after": {"name": remote_name, "four_char_id": remote_four_char},
                }
            )

    return {
        "summary": {
            "remote_network_count": len(remote_networks),
            "remote_site_count": len(remote_sites),
            "added_networks": len(added_networks),
            "updated_networks": len(updated_networks),
            "removed_networks": len(removed_networks),
            "added_sites": len(added_sites),
            "updated_sites": len(updated_sites),
            "removed_sites": len(removed_sites),
        },
        "samples": {
            "added_networks": added_networks[:10],
            "updated_networks": updated_networks[:10],
            "removed_networks": removed_networks[:10],
            "added_sites": added_sites[:10],
            "updated_sites": updated_sites[:10],
            "removed_sites": removed_sites[:10],
        },
    }


async def apply_npi_refresh(db: Session, *, force: bool) -> dict[str, Any]:
    return await bootstrap_npi_data(db, force=force)
