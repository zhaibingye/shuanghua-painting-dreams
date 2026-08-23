from dataclasses import dataclass

from app.infrastructure.config import Settings
from app.providers.base import ProviderTransport
from app.providers.bytedance_video import ByteDanceVideoAdapter
from app.providers.google_gemini_image import GoogleGeminiImageAdapter
from app.providers.openai_image import OpenAIImageAdapter
from app.providers.openai_responses_image import OpenAIResponsesImageAdapter
from app.providers.xai_image import XAIImageAdapter
from app.providers.xai_video import XAIVideoAdapter


@dataclass(slots=True)
class ProviderRegistry:
    google_gemini_image: GoogleGeminiImageAdapter
    openai_image: OpenAIImageAdapter
    openai_responses_image: OpenAIResponsesImageAdapter
    xai_image: XAIImageAdapter
    byte_dance_video: ByteDanceVideoAdapter
    xai_video: XAIVideoAdapter

    @classmethod
    def create(cls, transport: ProviderTransport, settings: Settings) -> "ProviderRegistry":
        return cls(
            google_gemini_image=GoogleGeminiImageAdapter(transport, settings),
            openai_image=OpenAIImageAdapter(transport, settings),
            openai_responses_image=OpenAIResponsesImageAdapter(transport, settings),
            xai_image=XAIImageAdapter(transport, settings),
            byte_dance_video=ByteDanceVideoAdapter(transport, settings),
            xai_video=XAIVideoAdapter(transport, settings),
        )
