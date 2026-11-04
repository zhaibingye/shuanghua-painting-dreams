import pytest
from app.domain.errors import SecurityError
from app.providers.bytedance_endpoints import byte_dance_endpoints


@pytest.mark.parametrize(
    ("base", "root", "official"),
    [
        ("https://ark.cn-beijing.volces.com", "https://ark.cn-beijing.volces.com/api/v3", True),
        (
            "https://ARK.CN-BEIJING.VOLCES.COM/api/v3/",
            "https://ark.cn-beijing.volces.com/api/v3",
            True,
        ),
        (
            "https://ark.ap-southeast.bytepluses.com/api/v3",
            "https://ark.ap-southeast.bytepluses.com/api/v3",
            True,
        ),
        ("https://ark.cn-beijing.volces.com/v1", "https://ark.cn-beijing.volces.com/api/v3", True),
        ("https://shapi.vip", "https://shapi.vip/v1", False),
        ("https://shapi.vip/v1/", "https://shapi.vip/v1", False),
        ("https://proxy.example.com/api/v3", "https://proxy.example.com/v1", False),
        ("https://proxy.example.com/gateway/v1", "https://proxy.example.com/gateway/v1", False),
        (
            "https://ark.cn-beijing.volces.com.evil.example",
            "https://ark.cn-beijing.volces.com.evil.example/v1",
            False,
        ),
        (
            "https://proxy.example.com/ark.cn-beijing.volces.com",
            "https://proxy.example.com/ark.cn-beijing.volces.com/v1",
            False,
        ),
    ],
)
def test_byte_dance_routes_follow_exact_host_and_normalize_api_version(
    base: str, root: str, official: bool
) -> None:
    endpoints = byte_dance_endpoints(base)
    assert endpoints.official is official
    assert str(endpoints.image()) == f"{root}/images/generations"
    assert (
        str(endpoints.image(editing=True))
        == f"{root}/images/{'generations' if official else 'edits'}"
    )
    video = "contents/generations/tasks" if official else "videos"
    assert str(endpoints.video()) == f"{root}/{video}"
    assert str(endpoints.video("task_123")) == f"{root}/{video}/task_123"


def test_unsafe_task_id_cannot_change_video_route() -> None:
    with pytest.raises(SecurityError):
        byte_dance_endpoints("https://proxy.example.com").video("../other")


def test_video_task_id_is_encoded_once() -> None:
    url = byte_dance_endpoints("https://proxy.example.com").video("task 123")
    assert str(url) == "https://proxy.example.com/v1/videos/task%20123"
