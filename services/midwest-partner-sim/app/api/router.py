from fastapi import APIRouter

from app.api.routes.edi import router as edi_router
from app.api.routes.functional_acknowledgments import router as functional_acknowledgments_router
from app.api.routes.health import router as health_router
from app.api.routes.loads import router as loads_router
from app.api.routes.readiness import router as readiness_router
from app.api.routes.shipment_events import router as shipment_events_router
from app.api.routes.sftp import router as sftp_router
from app.api.routes.tender_decisions import router as tender_decisions_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(readiness_router)
api_router.include_router(edi_router)
api_router.include_router(loads_router)
api_router.include_router(tender_decisions_router)
api_router.include_router(shipment_events_router)
api_router.include_router(functional_acknowledgments_router)
api_router.include_router(sftp_router)
