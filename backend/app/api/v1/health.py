from fastapi import APIRouter
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Return API operational health check status."""
    return HealthResponse(status="ok", service="ojapilot-api")
