def test_create_and_list_project(client, auth_headers):
    headers = auth_headers()

    response = client.post(
        "/projects/",
        json={"name": "Western Ghats Restoration", "description": "desc"},
        headers=headers,
    )
    assert response.status_code == 201
    project = response.json()
    assert project["name"] == "Western Ghats Restoration"

    response = client.get("/projects/", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_duplicate_project_name_same_user(client, auth_headers):
    headers = auth_headers()
    client.post("/projects/", json={"name": "Dup"}, headers=headers)
    response = client.post("/projects/", json={"name": "Dup"}, headers=headers)
    assert response.status_code == 400


def test_duplicate_project_name_different_users_allowed(client, auth_headers):
    headers1 = auth_headers("a@example.com")
    headers2 = auth_headers("b@example.com")

    r1 = client.post("/projects/", json={"name": "Shared Name"}, headers=headers1)
    r2 = client.post("/projects/", json={"name": "Shared Name"}, headers=headers2)

    assert r1.status_code == 201
    assert r2.status_code == 201


def test_user_cannot_see_other_users_projects(client, auth_headers):
    headers1 = auth_headers("owner@example.com")
    headers2 = auth_headers("other@example.com")

    client.post("/projects/", json={"name": "Private Project"}, headers=headers1)

    response = client.get("/projects/", headers=headers2)
    assert response.status_code == 200
    assert response.json() == []


def test_user_cannot_delete_other_users_project(client, auth_headers):
    headers1 = auth_headers("owner2@example.com")
    headers2 = auth_headers("other2@example.com")

    created = client.post(
        "/projects/", json={"name": "Locked Project"}, headers=headers1
    ).json()

    response = client.delete(f"/projects/{created['id']}", headers=headers2)
    assert response.status_code == 404


def test_delete_project_cascades_to_sites(client, auth_headers):
    from tests.conftest import SAMPLE_POLYGON

    headers = auth_headers("cascade@example.com")
    project = client.post(
        "/projects/", json={"name": "Cascade Project"}, headers=headers
    ).json()

    site = client.post(
        "/sites/",
        json={
            "project_id": project["id"],
            "name": "Site A",
            "description": "",
            "geometry": SAMPLE_POLYGON,
        },
        headers=headers,
    ).json()

    delete_response = client.delete(
        f"/projects/{project['id']}", headers=headers
    )
    assert delete_response.status_code == 200

    site_response = client.get(f"/sites/{site['id']}", headers=headers)
    assert site_response.status_code == 404
