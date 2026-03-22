import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from googleapiclient.errors import HttpError

from youtube_monitor.collector.youtube_client import (
    YouTubeClient,
    QuotaExceededException,
)


def make_http_error(status_code: int, reason: str = "quotaExceeded") -> HttpError:
    resp = MagicMock()
    resp.status = status_code
    content = json.dumps({"error": {"errors": [{"reason": reason}]}}).encode()
    error = HttpError(resp=resp, content=content)
    return error


@pytest.fixture
def client():
    with patch("youtube_monitor.collector.youtube_client.build") as mock_build:
        mock_build.return_value = MagicMock()
        return YouTubeClient(api_key="fake_key")


async def test_get_channel_info_success(client):
    mock_response = {
        "items": [
            {
                "id": "UCxxx",
                "snippet": {
                    "title": "Test Channel",
                    "description": "A test channel",
                    "thumbnails": {"default": {"url": "http://example.com/thumb.jpg"}},
                    "country": "TW",
                    "customUrl": "@testchannel",
                    "tags": ["test"],
                },
                "statistics": {
                    "subscriberCount": "1000",
                    "videoCount": "50",
                    "viewCount": "100000",
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UUxxx"}},
                "topicDetails": {
                    "topicCategories": ["https://en.wikipedia.org/wiki/Technology"]
                },
            }
        ]
    }
    client._run_in_executor = AsyncMock(return_value=mock_response)

    result = await client.get_channel_info("UCxxx")

    assert result is not None
    assert result["youtube_channel_id"] == "UCxxx"
    assert result["channel_name"] == "Test Channel"
    assert result["subscriber_count"] == 1000
    assert result["video_count"] == 50
    assert result["view_count"] == 100000
    assert result["uploads_playlist_id"] == "UUxxx"
    assert result["country"] == "TW"


async def test_get_channel_info_not_found(client):
    client._run_in_executor = AsyncMock(return_value={"items": []})
    result = await client.get_channel_info("UCnonexistent")
    assert result is None


async def test_quota_exceeded_raises_exception(client):
    error = make_http_error(403, "quotaExceeded")
    client._run_in_executor = AsyncMock(side_effect=error)

    with pytest.raises(QuotaExceededException):
        await client.get_channel_info("UCxxx")


async def test_backoff_on_503(client):
    error_503 = make_http_error(503, "backendError")
    success_response = {"items": []}

    # Fail twice then succeed
    client._run_in_executor = AsyncMock(
        side_effect=[error_503, error_503, success_response]
    )

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await client.get_channel_info("UCxxx")

    assert result is None  # empty items → None
    assert client._run_in_executor.call_count == 3


async def test_playlist_items_caps_at_200(client):
    """Mock playlist with 250+ videos (5+ pages), verify max 200 (4 pages) returned."""

    def make_page_response(video_count: int, has_next: bool) -> dict:
        return {
            "items": [
                {"contentDetails": {"videoId": f"vid_{i}"}} for i in range(video_count)
            ],
            "nextPageToken": "token_next" if has_next else None,
        }

    # 5 pages of 50 videos each, all with nextPageToken
    page_responses = [make_page_response(50, True)] * 5

    client._run_in_executor = AsyncMock(side_effect=page_responses)

    result = await client.get_uploads_playlist_items("PLxxx", max_pages=4)

    # Should cap at 4 pages * 50 = 200
    assert len(result) == 200
    assert client._run_in_executor.call_count == 4


async def test_no_search_list_usage():
    """Verify no search().list calls exist in the collector module."""
    import subprocess

    result = subprocess.run(
        [
            "grep",
            "-r",
            "--include=*.py",
            "search().list",
            "src/youtube_monitor/collector/",
        ],
        capture_output=True,
        text=True,
        cwd="/root/Projects/youtubeChannelsMonitor/backend",
    )
    assert result.stdout == "", f"Found forbidden search().list: {result.stdout}"
