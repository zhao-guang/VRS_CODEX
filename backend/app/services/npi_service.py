from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.import_batch import ImportBatch
from app.models.membership import NetworkSiteMembership
from app.models.network import Network
from app.models.site import Site


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


async def _fetch_paginated_collection(url: str, embedded_key: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    next_url = url

    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        while next_url:
            response = await client.get(next_url)
            response.raise_for_status()
            payload = response.json()
            items.extend(payload.get("_embedded", {}).get(embedded_key, []))
            next_url = payload.get("_links", {}).get("next", {}).get("href")

    return items


async def bootstrap_npi_data(db: Session, *, force: bool = False) -> dict[str, Any]:
    successful_batches = db.scalar(
        select(func.count(ImportBatch.id)).where(ImportBatch.source == "npi", ImportBatch.status == "succeeded")
    )
    existing_seed_count = db.scalar(
        select(func.count(Network.id)).where(Network.source_type == "npi_seed", Network.is_deleted.is_(False))
    )

    if successful_batches and not force:
        return {
            "performed": False,
            "reason": "already_bootstrapped",
            "networks": existing_seed_count,
            "sites": db.scalar(
                select(func.count(Site.id)).where(Site.source_type == "npi_seed", Site.is_deleted.is_(False))
            ),
        }

    should_cleanup_seed = force or (not successful_batches and bool(existing_seed_count))
    import_batch = ImportBatch(source="npi", status="running", is_initial=not bool(successful_batches))
    db.add(import_batch)
    db.commit()
    db.refresh(import_batch)

    try:
        network_payloads, site_payloads = await _fetch_paginated_collection(
            settings.npi_networks_url, "corsNetworks"
        ), await _fetch_paginated_collection(settings.npi_sites_url, "corsSites")

        if should_cleanup_seed:
            network_ids = db.scalars(select(Network.id).where(Network.source_type == "npi_seed")).all()
            site_ids = db.scalars(select(Site.id).where(Site.source_type == "npi_seed")).all()
            if network_ids:
                db.execute(delete(NetworkSiteMembership).where(NetworkSiteMembership.network_id.in_(network_ids)))
            if site_ids:
                db.execute(delete(NetworkSiteMembership).where(NetworkSiteMembership.site_id.in_(site_ids)))
                db.execute(delete(Site).where(Site.id.in_(site_ids)))
            if network_ids:
                db.execute(delete(Network).where(Network.id.in_(network_ids)))
            db.commit()

        existing_networks = {
            network.external_id: network
            for network in db.scalars(
                select(Network).where(Network.external_id.is_not(None)).options(selectinload(Network.memberships))
            )
        }

        existing_sites = {
            site.external_id: site
            for site in db.scalars(
                select(Site).where(Site.external_id.is_not(None)).options(selectinload(Site.memberships))
            )
        }

        for payload in network_payloads:
            network = existing_networks.get(payload["id"])
            if network is None:
                network = Network(external_id=payload["id"], source_type="npi_seed")
                db.add(network)
            network.name = payload.get("name") or f"NPI-{payload['id']}"
            network.description = payload.get("description")
            network.status = "active"
            network.last_import_batch_id = import_batch.id

        db.flush()

        for payload in site_payloads:
            site = existing_sites.get(payload["id"])
            if site is None:
                site = Site(external_id=payload["id"], source_type="npi_seed")
                db.add(site)

            approximate_position = payload.get("approximatePosition") or {}
            coordinates = approximate_position.get("coordinates") or [None, None, None]
            monument = payload.get("monument") or {}
            site.name = payload.get("name") or None
            site.four_char_id = payload.get("fourCharacterId")
            site.domes_number = payload.get("domesNumber")
            site.description = payload.get("description")
            site.latitude = coordinates[0]
            site.longitude = coordinates[1]
            site.ellipsoidal_height = coordinates[2]
            site.date_installed = _parse_datetime(payload.get("dateInstalled"))
            site.site_status = payload.get("siteStatus")
            site.monument_description = monument.get("description")
            site.monument_foundation = monument.get("foundation")
            site.marker_description = monument.get("markerDescription")
            site.monument_height = monument.get("height")
            site.geologic_characteristic = payload.get("geologicCharacteristic")
            site.bedrock_type = payload.get("bedrockType")
            site.last_import_batch_id = import_batch.id

        db.flush()

        all_networks = {
            network.external_id: network
            for network in db.scalars(select(Network).where(Network.external_id.is_not(None)))
        }
        all_sites = {site.external_id: site for site in db.scalars(select(Site).where(Site.external_id.is_not(None)))}

        seeded_membership_pairs = {
            (membership.network_id, membership.site_id)
            for membership in db.scalars(
                select(NetworkSiteMembership).where(NetworkSiteMembership.source_type == "npi_seed")
            )
        }

        for payload in site_payloads:
            site = all_sites.get(payload["id"])
            if site is None:
                continue

            for tenancy in payload.get("networkTenancies") or []:
                network = all_networks.get(tenancy.get("corsNetworkId"))
                if network is None:
                    continue

                pair = (network.id, site.id)
                if pair in seeded_membership_pairs:
                    continue

                period = tenancy.get("period") or {}
                membership = NetworkSiteMembership(
                    network_id=network.id,
                    site_id=site.id,
                    source_type="npi_seed",
                    valid_from=_parse_datetime(period.get("from")),
                    valid_to=_parse_datetime(period.get("to")),
                )
                db.add(membership)
                seeded_membership_pairs.add(pair)

        import_batch.status = "succeeded"
        import_batch.total_networks = len(network_payloads)
        import_batch.total_sites = len(site_payloads)
        import_batch.details_json = {
            "fetched_at": datetime.now(tz=UTC).isoformat(),
            "force": force,
        }
        db.commit()
        return {
            "performed": True,
            "reason": "completed",
            "batch_id": import_batch.id,
            "networks": len(network_payloads),
            "sites": len(site_payloads),
        }
    except Exception as exc:
        import_batch.status = "failed"
        import_batch.details_json = {"error": str(exc)}
        db.commit()
        raise
