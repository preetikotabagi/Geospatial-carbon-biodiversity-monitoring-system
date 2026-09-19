import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/darukaa_earth_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def _reset_database():
    """Give every test a clean set of tables."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Register + log in a user, return Authorization headers for it."""

    def _make(email="user@example.com", password="password123"):
        client.post("/auth/register", json={"email": email, "password": password})
        response = client.post(
            "/auth/login", json={"email": email, "password": password}
        )
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _make


SAMPLE_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [75.10, 15.30],
            [75.11, 15.30],
            [75.11, 15.31],
            [75.10, 15.31],
            [75.10, 15.30],
        ]
    ],
}
