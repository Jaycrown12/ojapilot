from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.businesses import router as businesses_router
from app.api.v1.products import router as products_router
from app.api.v1.sales import router as sales_router
from app.api.v1.copilot import router as copilot_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(businesses_router)
api_v1_router.include_router(products_router)
api_v1_router.include_router(sales_router)
api_v1_router.include_router(copilot_router)

__all__ = ["api_v1_router"]
