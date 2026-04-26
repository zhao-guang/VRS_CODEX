from app.schemas.common import APIEnvelope


def ok(data, *, message: str = "success", meta: dict | None = None) -> APIEnvelope:
    return APIEnvelope(code="OK", message=message, data=data, meta=meta or {})
