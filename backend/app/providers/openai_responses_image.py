from collections.abc import AsyncIterator, Mapping
from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.models import GeneratedImage, ImageStreamChunk, Usage
from app.infrastructure.config import Settings
from app.infrastructure.upstream_errors import build_upstream_error
from app.infrastructure.url_builder import build_upstream_url
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    image_asset_value,
    invalid_response_error,
    split_data_url,
)
from app.schemas.image_turns import (
    OpenAIResponsesImageCallHistoryItem,
    OpenAIResponsesImageOptions,
    OpenAIResponsesImageTurnRequest,
    OpenAIResponsesMessageHistoryItem,
)


class OpenAIResponsesImageAdapter:
    api_format = ApiFormat.OPENAI_RESPONSES_IMAGE

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def stream_turn(
        self,
        request: OpenAIResponsesImageTurnRequest,
        api_key: str,
    ) -> AsyncIterator[ImageStreamChunk]:
        payload = {
            "model": request.model_id,
            "input": self._input(request),
            "tools": [self._tool(request.options)],
            "tool_choice": {"type": "image_generation"},
            "store": False,
            "stream": True,
        }

        if request.options.safety_identifier:
            payload["safety_identifier"] = request.options.safety_identifier

        response_id: str | None = None
        completed_call_ids: set[str] = set()
        completed_count = 0
        text_emitted = False
        final_usage: Usage | None = None
        response_completed = False

        async for event in self._transport.stream_sse(
            method="POST",
            url=build_upstream_url(request.base_url, "/v1/responses"),
            headers=bearer_headers(api_key, stream=True),
            payload=payload,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        ):
            if event.data == "[DONE]":
                continue
            data = event.data if isinstance(event.data, Mapping) else {}
            event_type = _event_type(event.event, data)

            if event_type in {"error", "response.failed", "response.incomplete"}:
                error_payload = (
                    data.get("response") if isinstance(data.get("response"), Mapping) else data
                )
                if event_type == "response.incomplete":
                    raise ApplicationError(
                        code="incompleteUpstreamResponse",
                        category=ErrorCategory.UPSTREAM_ERROR,
                        message="OpenAI Responses API 未能完整生成当前图片。",
                        http_status=502,
                        api_format=self.api_format,
                    )
                raise build_upstream_error(
                    status=400,
                    data=error_payload,
                    api_format=self.api_format,
                )

            if event_type in {"response.created", "response.in_progress"}:
                response_id = _response_id(data) or response_id
                continue

            if event_type == "response.image_generation_call.partial_image":
                encoded = data.get("partial_image_b64") or data.get("b64_json")
                if isinstance(encoded, str) and encoded:
                    yield ImageStreamChunk(
                        kind="partial",
                        image=GeneratedImage(
                            mime_type=_mime_type(request.options.output_format),
                            base64_data=encoded,
                        ),
                        image_index=_integer(data.get("output_index")) or 0,
                        partial_image_index=_integer(data.get("partial_image_index")),
                        provider_metadata={"callId": _string(data.get("item_id"))},
                    )
                continue

            if event_type == "response.output_text.delta":
                delta = data.get("delta")
                if isinstance(delta, str) and delta:
                    text_emitted = True
                    yield ImageStreamChunk(kind="text_delta", text_delta=delta)
                continue

            if event_type == "response.output_item.done":
                item = data.get("item")
                if isinstance(item, Mapping) and item.get("type") == "image_generation_call":
                    call_id = _string(item.get("id"))
                    if call_id is None or call_id not in completed_call_ids:
                        chunk = _image_call_chunk(
                            item,
                            request.options.output_format,
                            _integer(data.get("output_index")) or completed_count,
                        )
                        if chunk is not None:
                            if call_id is not None:
                                completed_call_ids.add(call_id)
                            completed_count += 1
                            yield chunk
                continue

            if event_type == "response.completed":
                response_completed = True
                response = data.get("response")
                if not isinstance(response, Mapping):
                    response = data
                response_id = _string(response.get("id")) or response_id
                final_usage = _usage(response.get("usage")) or final_usage
                output = response.get("output")
                if isinstance(output, list):
                    for output_index, item in enumerate(output):
                        if not isinstance(item, Mapping):
                            continue
                        if item.get("type") == "image_generation_call":
                            call_id = _string(item.get("id"))
                            if call_id is not None and call_id in completed_call_ids:
                                continue
                            chunk = _image_call_chunk(
                                item,
                                request.options.output_format,
                                output_index,
                            )
                            if chunk is not None:
                                if call_id is not None:
                                    completed_call_ids.add(call_id)
                                completed_count += 1
                                yield chunk
                        elif item.get("type") == "message" and not text_emitted:
                            text = _message_text(item)
                            if text:
                                text_emitted = True
                                yield ImageStreamChunk(kind="text_delta", text_delta=text)
                break

        if not response_completed:
            raise invalid_response_error(
                self.api_format,
                "OpenAI Responses 流在完整响应完成前意外结束。",
            )
        if completed_count == 0:
            raise invalid_response_error(
                self.api_format,
                "OpenAI Responses 流式响应中没有图像工具结果。",
            )
        yield ImageStreamChunk(
            kind="done",
            usage=final_usage,
            provider_state={
                "type": "openaiResponses",
                "responseId": response_id,
                "store": False,
            },
        )

    @staticmethod
    def _input(request: OpenAIResponsesImageTurnRequest) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for history_item in request.history:
            if isinstance(history_item, OpenAIResponsesMessageHistoryItem):
                content: list[dict[str, Any]] = [{"type": "input_text", "text": history_item.text}]
                content.extend(
                    {
                        "type": "input_image",
                        "image_url": image_asset_value(image),
                        "detail": "auto",
                    }
                    for image in history_item.images
                )
                items.append({"role": "user", "content": content})
            elif isinstance(history_item, OpenAIResponsesImageCallHistoryItem):
                _, encoded = split_data_url(history_item.image.data_url)
                items.append(
                    {
                        "type": "image_generation_call",
                        "id": history_item.call_id,
                        "status": history_item.status,
                        "result": encoded,
                    }
                )

        current_content: list[dict[str, Any]] = [{"type": "input_text", "text": request.prompt}]
        current_content.extend(
            {
                "type": "input_image",
                "image_url": image_asset_value(image),
                "detail": "auto",
            }
            for image in request.images
        )
        items.append({"role": "user", "content": current_content})
        return items

    @staticmethod
    def _tool(options: OpenAIResponsesImageOptions) -> dict[str, Any]:
        tool: dict[str, Any] = {
            "type": "image_generation",
            "action": "auto",
            "model": options.image_model,
            "quality": options.quality,
            "size": options.size,
            "output_format": options.output_format,
            "background": options.background,
            "partial_images": options.partial_images,
            "moderation": options.moderation,
        }
        if options.output_format in {"jpeg", "webp"}:
            tool["output_compression"] = options.output_compression
        if options.input_fidelity != "auto":
            tool["input_fidelity"] = options.input_fidelity
        return tool


def _image_call_chunk(
    item: Mapping[str, Any],
    output_format: str,
    output_index: int,
) -> ImageStreamChunk | None:
    encoded = item.get("result")
    if not isinstance(encoded, str) or not encoded:
        return None
    call_id = _string(item.get("id"))
    prompt = _string(item.get("revised_prompt")) or _string(item.get("prompt"))
    return ImageStreamChunk(
        kind="completed",
        image=GeneratedImage(
            mime_type=_mime_type(output_format),
            base64_data=encoded,
            revised_prompt=prompt,
        ),
        image_index=output_index,
        provider_metadata={
            "callId": call_id,
            "status": _string(item.get("status")) or "completed",
            "prompt": prompt,
        },
    )


def _message_text(item: Mapping[str, Any]) -> str:
    content = item.get("content")
    if not isinstance(content, list):
        return ""
    texts: list[str] = []
    for part in content:
        if not isinstance(part, Mapping):
            continue
        text = part.get("text")
        if isinstance(text, str) and text:
            texts.append(text)
    return "\n\n".join(texts)


def _event_type(event_name: str | None, data: Mapping[str, Any]) -> str:
    value = data.get("type")
    return value if isinstance(value, str) else event_name or ""


def _response_id(data: Mapping[str, Any]) -> str | None:
    response = data.get("response")
    if isinstance(response, Mapping):
        return _string(response.get("id"))
    return _string(data.get("id"))


def _mime_type(output_format: str) -> str:
    if output_format == "jpeg":
        return "image/jpeg"
    if output_format == "webp":
        return "image/webp"
    return "image/png"


def _usage(value: object) -> Usage | None:
    if not isinstance(value, Mapping):
        return None
    return Usage(
        input_tokens=_integer(value.get("input_tokens")),
        output_tokens=_integer(value.get("output_tokens")),
        total_tokens=_integer(value.get("total_tokens")),
    )


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
