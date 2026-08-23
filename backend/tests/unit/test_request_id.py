from app.infrastructure.request_id import _request_id_from_header


def test_valid_request_id_is_preserved() -> None:
    assert _request_id_from_header("trace-123:child_1") == "trace-123:child_1"


def test_invalid_or_oversized_request_id_is_replaced() -> None:
    invalid_values = ["contains spaces", "line\nbreak", "x" * 129, ""]

    for value in invalid_values:
        generated = _request_id_from_header(value)
        assert generated.startswith("req_")
        assert generated != value
