from fastapi import APIRouter

from .health import router as health_router
from .ingest import router as ingest_router
from .auth import router as auth_router
from .search import router as search_router
from .detail import router as detail_router
from .taxonomy import router as taxonomy_router

router = APIRouter()

router.include_router(health_router, prefix="/health", tags=["Health"])
router.include_router(ingest_router, prefix="/ingest", tags=["Ingest"])
router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(search_router, prefix="/search", tags=["Search"])
router.include_router(taxonomy_router, prefix="/taxonomy", tags=["Taxonomy"])
router.include_router(detail_router, tags=["Detail"])
