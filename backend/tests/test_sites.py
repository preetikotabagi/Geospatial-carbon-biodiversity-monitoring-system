from sqlalchemy import text

from app.database import engine
from tests.conftest import SAMPLE_POLYGON


def _make_project(client, headers, name="Test Project"):
    return client.post("/projects/", json={"name": name}, headers=headers).json()


def test_create_site_success(client, auth_headers):
    headers = auth_headers()
    project = _make_project(client, headers)

    response = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Site A",
            "description": "A test site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Site A"


def test_create_site_requires_existing_project(client, auth_headers):
    headers = auth_headers()
    response = client.post(
        "/sites/",
        json={
            "project_id": 999999,
            "name": "Orphan Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    )
    assert response.status_code == 404


def test_create_site_rejects_non_polygon_geometry(client, auth_headers):
    headers = auth_headers()
    project = _make_project(client, headers)

    point_geometry = {"type": "Point", "coordinates": [75.1, 15.3]}

    response = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Bad Site",
            "geometry": point_geometry,
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_create_site_rejects_invalid_geojson(client, auth_headers):
    headers = auth_headers()
    project = _make_project(client, headers)

    response = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Bad Site",
            "geometry": {"type": "Polygon", "coordinates": "not-coordinates"},
        },
        headers=headers,
    )
    assert response.status_code in (400, 422)


def test_user_cannot_create_site_under_other_users_project(client, auth_headers):
    owner_headers = auth_headers("siteowner@example.com")
    attacker_headers = auth_headers("attacker@example.com")

    project = _make_project(client, owner_headers, "Owner's Project")

    response = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Sneaky Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=attacker_headers,
    )
    assert response.status_code == 404


def test_user_cannot_list_other_users_sites(client, auth_headers):
    owner_headers = auth_headers("siteowner2@example.com")
    other_headers = auth_headers("other3@example.com")

    project = _make_project(client, owner_headers, "Owner's Project 2")
    client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Owner Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=owner_headers,
    )

    response = client.get("/sites/", headers=other_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_sites_filtered_by_project_id_query_param(client, auth_headers):
    headers = auth_headers("filteruser@example.com")
    project1 = _make_project(client, headers, "Project One")
    project2 = _make_project(client, headers, "Project Two")

    client.post(
        "/sites/",
        json={
            "project_id": project1["id"],
            "name": "Site in P1",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    )
    client.post(
        "/sites/",
        json={
            "project_id": project2["id"],
            "name": "Site in P2",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    )

    response = client.get(f"/sites/?project_id={project1['id']}", headers=headers)
    assert response.status_code == 200
    sites = response.json()
    assert len(sites) == 1
    assert sites[0]["name"] == "Site in P1"


def test_site_analytics_no_metrics(client, auth_headers):
    headers = auth_headers()
    project = _make_project(client, headers)
    site = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Empty Metrics Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    ).json()

    response = client.get(f"/sites/{site['id']}/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["current"]["carbon_tco2e"] == 0
    assert data["current"]["biodiversity_score"] == 0
    assert data["history"] == []
    assert data["area_hectares"] > 0


def test_site_analytics_with_metrics_uses_latest_year(client, auth_headers):
    headers = auth_headers()
    project = _make_project(client, headers)
    site = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Metrics Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    ).json()

    for year, carbon, bio in [(2022, 100, 50), (2023, 150, 60)]:
        client.post(
            f"/sites/{site['id']}/metrics",
            json={
                "year": year,
                "carbon_tco2e": carbon,
                "biodiversity_score": bio,
            },
            headers=headers,
        )

    response = client.get(f"/sites/{site['id']}/analytics", headers=headers)
    data = response.json()
    assert data["current"]["carbon_tco2e"] == 150
    assert data["current"]["biodiversity_score"] == 60
    assert len(data["history"]) == 2


def test_user_cannot_view_other_users_site_analytics(client, auth_headers):
    owner_headers = auth_headers("analyticsowner@example.com")
    other_headers = auth_headers("analyticsother@example.com")

    project = _make_project(client, owner_headers, "Analytics Project")
    site = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Private Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=owner_headers,
    ).json()

    response = client.get(f"/sites/{site['id']}/analytics", headers=other_headers)
    assert response.status_code == 404


def _site_with_metrics(client, headers):
    project = _make_project(client, headers)
    site = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Drifted Site",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    ).json()
    for year, carbon, bio in [(2022, 100, 50), (2023, 150, 60)]:
        client.post(
            f"/sites/{site['id']}/metrics",
            json={"year": year, "carbon_tco2e": carbon, "biodiversity_score": bio},
            headers=headers,
        )
    return site


def test_site_analytics_survives_non_integer_metric_columns(client, auth_headers):
    """A pre-existing site_metrics table with FLOAT columns must not cause a 500."""
    headers = auth_headers()
    site = _site_with_metrics(client, headers)

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE site_metrics "
                "ALTER COLUMN carbon_tco2e TYPE double precision, "
                "ALTER COLUMN biodiversity_score TYPE double precision"
            )
        )
        conn.execute(
            text(
                "UPDATE site_metrics SET carbon_tco2e = carbon_tco2e + 0.4, "
                "biodiversity_score = biodiversity_score + 0.3"
            )
        )

    response = client.get(f"/sites/{site['id']}/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["current"] == {"carbon_tco2e": 150, "biodiversity_score": 60}
    assert [h["year"] for h in data["history"]] == [2022, 2023]


def test_site_analytics_survives_geometry_with_unknown_srid(client, auth_headers):
    """ST_Transform raises on SRID 0; the area must still be computed."""
    headers = auth_headers()
    site = _site_with_metrics(client, headers)

    expected = client.get(f"/sites/{site['id']}/analytics", headers=headers).json()

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE sites ALTER COLUMN geometry "
                "TYPE geometry(Polygon, 0) USING ST_SetSRID(geometry, 0)"
            )
        )

    response = client.get(f"/sites/{site['id']}/analytics", headers=headers)
    assert response.status_code == 200
    assert response.json()["area_hectares"] == expected["area_hectares"] > 0
