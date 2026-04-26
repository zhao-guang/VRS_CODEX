from collections.abc import Mapping

from sqlalchemy.orm import Session

from app.models.audit_log import EntityAuditLog


def write_audit_log(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    before: Mapping | None,
    after: Mapping | None,
    operator: str = "system",
) -> None:
    log = EntityAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before_json=dict(before) if before else None,
        after_json=dict(after) if after else None,
        operator=operator,
    )
    db.add(log)
