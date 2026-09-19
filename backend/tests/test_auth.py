def test_register_success(client):
    response = client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"


def test_register_duplicate_email(client):
    client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "password123"},
    )
    response = client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "password123"},
    )
    assert response.status_code == 400


def test_login_success(client):
    client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client):
    client.post(
        "/auth/register",
        json={"email": "login2@example.com", "password": "password123"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "login2@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_protected_endpoint_without_token(client):
    response = client.get("/projects/")
    assert response.status_code in (401, 403)


def test_protected_endpoint_with_invalid_token(client):
    response = client.get(
        "/projects/", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401
