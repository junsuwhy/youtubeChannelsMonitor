import asyncio
import random
from datetime import datetime, timezone
from functools import partial
from typing import Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class QuotaExceededException(Exception):
    """Raised when YouTube API returns 403 quotaExceeded. Do NOT retry."""

    pass


class YouTubeClient:
    def __init__(self, api_key: str):
        self._service = build("youtube", "v3", developerKey=api_key)

    async def _run_in_executor(self, func, *args, **kwargs):
        """Wrap synchronous YouTube API calls for async execution."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    async def _with_backoff(self, coro_func, max_retries: int = 3):
        """Retry with exponential backoff for transient errors (429, 500, 503).
        NEVER retry 403 quotaExceeded — raise QuotaExceededException immediately."""
        for attempt in range(max_retries + 1):
            try:
                return await coro_func()
            except HttpError as e:
                status = int(e.resp.status)
                content_str = (
                    e.content.decode()
                    if isinstance(e.content, bytes)
                    else str(e.content)
                )
                if status == 403 and "quotaExceeded" in content_str:
                    raise QuotaExceededException(str(e))
                if status in (429, 500, 503) and attempt < max_retries:
                    wait = (2**attempt) + random.uniform(0, 1)
                    await asyncio.sleep(wait)
                    continue
                raise

    async def get_channel_info(self, channel_id: str) -> Optional[dict]:
        """channels.list: 1 unit per call. Returns channel data or None if not found."""

        async def _call():
            return await self._run_in_executor(
                lambda: (
                    self._service.channels()
                    .list(
                        part="snippet,statistics,contentDetails,topicDetails",
                        id=channel_id,
                        maxResults=1,
                    )
                    .execute()
                )
            )

        response = await self._with_backoff(_call)
        items = response.get("items", [])
        if not items:
            return None

        item = items[0]
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        content_details = item.get("contentDetails", {})
        topic_details = item.get("topicDetails", {})

        return {
            "youtube_channel_id": item["id"],
            "channel_name": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "thumbnail_url": snippet.get("thumbnails", {})
            .get("default", {})
            .get("url", ""),
            "country": snippet.get("country", ""),
            "custom_url": snippet.get("customUrl", ""),
            "tags": snippet.get("tags", []),
            "topic_categories": topic_details.get("topicCategories", []),
            "subscriber_count": int(statistics.get("subscriberCount", 0)),
            "video_count": int(statistics.get("videoCount", 0)),
            "view_count": int(statistics.get("viewCount", 0)),
            "uploads_playlist_id": content_details.get("relatedPlaylists", {}).get(
                "uploads", ""
            ),
        }

    async def get_uploads_playlist_items(
        self, playlist_id: str, max_pages: int = 4
    ) -> list[str]:
        """playlistItems.list: 1 unit per page. Returns list of video IDs.
        NEVER uses search.list (100 units each — forbidden).
        Caps at max_pages * 50 = 200 videos per channel."""
        video_ids = []
        next_page_token = None
        pages_fetched = 0

        while pages_fetched < max_pages:
            token = next_page_token

            async def _call(t=token):
                kwargs = dict(
                    part="contentDetails", playlistId=playlist_id, maxResults=50
                )
                if t:
                    kwargs["pageToken"] = t
                return await self._run_in_executor(
                    lambda: self._service.playlistItems().list(**kwargs).execute()
                )

            response = await self._with_backoff(_call)
            items = response.get("items", [])

            for item in items:
                vid = item.get("contentDetails", {}).get("videoId", "")
                if vid:
                    video_ids.append(vid)

            next_page_token = response.get("nextPageToken")
            pages_fetched += 1

            if not next_page_token:
                break

        return video_ids

    async def get_video_details(self, video_ids: list[str]) -> list[dict]:
        """videos.list: 1 unit per 50 videos. Returns video metadata + stats.
        Batches in groups of 50."""
        results = []

        # Batch into groups of 50
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i : i + 50]
            ids_str = ",".join(batch)

            async def _call(ids=ids_str):
                return await self._run_in_executor(
                    lambda: (
                        self._service.videos()
                        .list(
                            part="snippet,statistics,contentDetails,status,topicDetails",
                            id=ids,
                            maxResults=50,
                        )
                        .execute()
                    )
                )

            response = await self._with_backoff(_call)

            for item in response.get("items", []):
                snippet = item.get("snippet", {})
                statistics = item.get("statistics", {})
                content_details = item.get("contentDetails", {})
                status = item.get("status", {})
                topic_details = item.get("topicDetails", {})

                published_at = snippet.get("publishedAt")
                if published_at:
                    published_at = datetime.fromisoformat(
                        published_at.replace("Z", "+00:00")
                    )

                results.append(
                    {
                        "youtube_video_id": item["id"],
                        "title": snippet.get("title", ""),
                        "description": snippet.get("description", ""),
                        "published_at": published_at,
                        "duration": content_details.get("duration", ""),
                        "tags": snippet.get("tags", []),
                        "topic_categories": topic_details.get("topicCategories", []),
                        "view_count": int(statistics.get("viewCount", 0)),
                        "like_count": int(statistics.get("likeCount", 0)),
                        "comment_count": int(statistics.get("commentCount", 0)),
                        "status": status.get("privacyStatus", "public"),
                    }
                )

        return results
