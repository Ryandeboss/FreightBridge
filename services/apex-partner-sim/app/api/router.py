from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.loads import router as loads_router
from app.api.routes.readiness import router as readiness_router
from app.api.routes.shipment_statuses import router as shipment_statuses_router
from app.api.routes.tender_responses import router as tender_responses_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(readiness_router)
api_router.include_router(loads_router)
api_router.include_router(tender_responses_router)
api_router.include_router(shipment_statuses_router)
