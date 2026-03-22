import datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from youtube_monitor.database import get_session
from youtube_monitor.main import app
from youtube_monitor.models.anomaly_event import AnomalyEvent
from youtube_monitor.models.channel import Channel


async def mock_current_user():
    from youtube_monitor.models.user import User

    return User(id=1, username="testuser", hashed_password="x", is_active=True)


@pytest.fixture
async def api_client_with_session(test_engine):
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_session():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    from youtube_monitor.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = mock_current_user

    session = async_session()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, session

    await session.close()
    app.dependency_overrides.clear()


@pytest.fixture
async def api_client_no_auth_override(test_engine):
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_session():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


async def _seed_anomalies(session):
    ch = Channel(
        youtube_channel_id="UCanomalyapi001", channel_name="Anomaly API Channel"
    )
    session.add(ch)
    await session.commit()
    await session.refresh(ch)

    event1 = AnomalyEvent(
        channel_id=ch.id,
        video_id=None,
        event_type="view_spike",
        severity="medium",
        summary="view spike",
        metric_name="view_count",
        metric_value=1000.0,
        baseline_value=200.0,
        deviation_score=4.0,
        is_acknowledged=False,
        snapshot_date=datetime.date(2026, 3, 20),
    )
    event2 = AnomalyEvent(
        channel_id=ch.id,
        video_id=None,
        event_type="subscriber_spike",
        severity="low",
        summary="subscriber spike",
        metric_name="subscriber_count",
        metric_value=200.0,
        baseline_value=50.0,
        deviation_score=3.2,
        is_acknowledged=False,
        snapshot_date=datetime.date(2026, 3, 21),
    )
    session.add_all([event1, event2])
    await session.commit()
    return ch.id


async def test_get_channel_anomalies_returns_paginated_shape(api_client_with_session):
    client, session = api_client_with_session
    channel_id = await _seed_anomalies(session)

    response = await client.get(f"/api/channels/{channel_id}/anomalies")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data
    assert data["total"] == 2


async def test_get_channel_anomalies_filter_by_event_type(api_client_with_session):
    client, session = api_client_with_session
    channel_id = await _seed_anomalies(session)

    response = await client.get(
        f"/api/channels/{channel_id}/anomalies?event_type=view_spike"
    )
    assert response.status_code == 200
    data = response.json()
    assert all(item["event_type"] == "view_spike" for item in data["items"])


async def test_get_channel_anomalies_nonexistent_channel_returns_empty_list(
    api_client_with_session,
):
    client, _ = api_client_with_session

    response = await client.get("/api/channels/9999/anomalies")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_get_channel_anomalies_without_auth_returns_401(
    api_client_no_auth_override,
):
    response = await api_client_no_auth_override.get("/api/channels/1/anomalies")
    assert response.status_code == 401
