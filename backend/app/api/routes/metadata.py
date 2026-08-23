from fastapi import APIRouter

from app.domain.capabilities import provider_metadata
from app.schemas.metadata import ProviderMetadataResponse

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.get("/providers", response_model=ProviderMetadataResponse)
async def providers() -> ProviderMetadataResponse:
    return provider_metadata()
