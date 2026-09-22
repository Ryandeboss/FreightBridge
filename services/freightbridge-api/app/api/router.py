from fastapi import APIRouter

from app.api.routes.apex_integrations import router as apex_integrations_router
from app.api.routes.health import router as health_router
from app.api.routes.midwest_integrations import router as midwest_integrations_router
from app.api.routes.readiness import router as readiness_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(readiness_router)
api_router.include_router(apex_integrations_router)
api_router.include_router(midwest_integrations_router)
