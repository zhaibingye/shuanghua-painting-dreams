from collections.abc import Mapping
from typing import Any

from app.domain.enums import ApiFormat
from app.domain.models import GeneratedImage, ImageResult, Usage
from app.infrastructure.config import Settings
from app.infrastructure.url_builder import build_upstream_url, encode_path_segment
from app.providers.base import (
    ProviderTransport,
    ensure_success,
    gemini_headers,
    invalid_response_error,
    split_data_url,
)
from app.schemas.common import DataUrlImageAsset, ImageAsset, UrlImageAsset
from app.schemas.image_turns import (
    GeminiConversationContent,
    GeminiImagePart,
    GeminiImageTurnRequest,
    GeminiTextPart,
)
from app.schemas.images import (
    GeminiImageEditRequest,
    GeminiImageGenerationRequest,
    GeminiImageOptions,
)


class GoogleGeminiImageAdapter:
    api_format = ApiFormat.GOOGLE_GEMINI_IMAGE

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def generate(self, request: GeminiImageGenerationRequest, api_key: str) -> ImageResult:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": request.prompt}]}],
            "generationConfig": self._generation_config(request.options),
        }
        return await self._request(
            request.base_url, request.model_id, request.options, api_key, payload
        )

    async def edit(self, request: GeminiImageEditRequest, api_key: str) -> ImageResult:
        parts: list[dict[str, Any]] = [{"text": request.prompt}]
        parts.extend(self._image_part(image) for image in request.images)
        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": self._generation_config(request.options),
        }
        return await self._request(
            request.base_url, request.model_id, request.options, api_key, payload
        )

    async def conversation(
        self,
        request: GeminiImageTurnRequest,
        api_key: str,
    ) -> ImageResult:
        contents = [self._conversation_content(content) for content in request.history]
        current_parts: list[dict[str, Any]] = [{"text": request.prompt}]
        current_parts.extend(self._image_part(image) for image in request.images)
        contents.append({"role": "user", "parts": current_parts})
        payload = {
            "contents": contents,
            "generationConfig": self._generation_config(request.options),
        }
        return await self._request(
            request.base_url,
            request.model_id,
            request.options,
            api_key,
            payload,
        )

    async def _request(
        self,
        base_url: str,
        model_id: str,
        options: GeminiImageOptions,
        api_key: str,
        payload: dict[str, Any],
    ) -> ImageResult:
        model = encode_path_segment(model_id)
        url = build_upstream_url(base_url, f"/v1/models/{model}:generateContent")
        response = await self._transport.request_json(
            method="POST",
            url=url,
            headers=gemini_headers(api_key),
            payload=payload,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        )
        data = ensure_success(response, api_format=self.api_format)
        return self._parse_response(data, options)

    @staticmethod
    def _generation_config(options: GeminiImageOptions) -> dict[str, Any]:
        modalities = ["IMAGE"]
        if options.response_modalities == "TEXT_AND_IMAGE":
            modalities = ["TEXT", "IMAGE"]
        return {
            "responseModalities": modalities,
            "responseFormat": {
                "image": {
                    "aspectRatio": options.aspect_ratio,
                    "imageSize": options.image_size,
                }
            },
            "thinkingConfig": {
                "thinkingLevel": options.thinking_level,
                "includeThoughts": options.include_thoughts,
            },
        }

    @classmethod
    def _conversation_content(cls, content: GeminiConversationContent) -> dict[str, Any]:
        parts: list[dict[str, Any]] = []
        for part in content.parts:
            if isinstance(part, GeminiTextPart):
                mapped: dict[str, Any] = {"text": part.text}
                if part.thought:
                    mapped["thought"] = True
                if part.thought_signature:
                    mapped["thought_signature"] = part.thought_signature
                parts.append(mapped)
            elif isinstance(part, GeminiImagePart):
                mapped = cls._image_part(part.image)
                if part.thought:
                    mapped["thought"] = True
                if part.thought_signature:
                    mapped["thought_signature"] = part.thought_signature
                parts.append(mapped)
        return {"role": content.role, "parts": parts}

    @staticmethod
    def _image_part(image: ImageAsset) -> dict[str, Any]:
        if isinstance(image, DataUrlImageAsset):
            mime_type, encoded = split_data_url(image.data_url)
            return {"inline_data": {"mime_type": mime_type, "data": encoded}}
        if isinstance(image, UrlImageAsset):
            return {"file_data": {"file_uri": str(image.url)}}
        raise TypeError(f"未知 Gemini 图片输入类型: {type(image)!r}")

    def _parse_response(
        self,
        data: Mapping[str, Any],
        options: GeminiImageOptions,
    ) -> ImageResult:
        candidates = data.get("candidates")
        if not isinstance(candidates, list):
            raise invalid_response_error(self.api_format, "Gemini 响应缺少 candidates。")

        images: list[GeneratedImage] = []
        text_outputs: list[str] = []
        model_parts: list[dict[str, Any]] = []
        for candidate in candidates:
            if not isinstance(candidate, Mapping):
                continue
            content = candidate.get("content")
            if not isinstance(content, Mapping):
                continue
            parts = content.get("parts")
            if not isinstance(parts, list):
                continue
            for part in parts:
                if not isinstance(part, Mapping):
                    continue
                thought = part.get("thought") is True
                signature = _string(part.get("thought_signature") or part.get("thoughtSignature"))
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    model_parts.append(
                        {
                            "kind": "text",
                            "text": text,
                            "thought": thought,
                            "thoughtSignature": signature,
                        }
                    )
                    if not thought:
                        text_outputs.append(text)
                inline_data = part.get("inline_data") or part.get("inlineData")
                if not isinstance(inline_data, Mapping):
                    continue
                mime_type = inline_data.get("mime_type") or inline_data.get("mimeType")
                encoded = inline_data.get("data")
                if isinstance(mime_type, str) and isinstance(encoded, str) and encoded:
                    image_index = len(images)
                    images.append(
                        GeneratedImage(
                            mime_type=mime_type,
                            base64_data=encoded,
                            is_thought=thought,
                            thought_signature=signature,
                        )
                    )
                    model_parts.append(
                        {
                            "kind": "image",
                            "imageIndex": image_index,
                            "thought": thought,
                            "thoughtSignature": signature,
                        }
                    )

        if not images:
            raise invalid_response_error(self.api_format, "Gemini 响应中没有可用图片。")

        usage_data = data.get("usageMetadata") or data.get("usage_metadata")
        usage = None
        if isinstance(usage_data, Mapping):
            usage = Usage(
                input_tokens=_integer(
                    usage_data.get("promptTokenCount") or usage_data.get("prompt_token_count")
                ),
                output_tokens=_integer(
                    usage_data.get("candidatesTokenCount")
                    or usage_data.get("candidates_token_count")
                ),
                total_tokens=_integer(
                    usage_data.get("totalTokenCount") or usage_data.get("total_token_count")
                ),
            )
        return ImageResult(
            images=images,
            text_outputs=text_outputs,
            usage=usage,
            provider_state={
                "type": "gemini",
                "parts": model_parts,
                "includeThoughts": options.include_thoughts,
            },
        )


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
