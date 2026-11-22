import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.fallback_store import mem_create_business, mem_get_business

client = TestClient(app)

TEST_USER_ID = "624b4cdd-025e-404b-b49c-3b10c0d49828"
TEST_TOKEN = jwt.encode(
    {"sub": TEST_USER_ID, "email": "test@ojapilot.local", "role": "authenticated"},
    "test-secret",
    algorithm="HS256",
)
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_create_password_protected_business_and_unlock():
    """Verify creating a business with a password, checking has_password, and unlocking."""
    res = client.post(
        "/api/v1/businesses",
        json={
            "name": "Secured Mart",
            "currency": "NGN",
            "password": "store-secret-pin-123",
        },
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 201, res.text
    data = res.json()
    biz_id = data["id"]
    assert data["has_password"] is True
    assert "password" not in data
    assert "password_hash" not in data

    # 1. Unlock with wrong password should fail with HTTP 401
    bad_res = client.post(
        f"/api/v1/businesses/{biz_id}/unlock",
        json={"password": "wrong-password"},
        headers=AUTH_HEADERS,
    )
    assert bad_res.status_code == 401
    assert "Incorrect store password" in bad_res.json()["detail"]

    # 2. Unlock with correct password should succeed
    good_res = client.post(
        f"/api/v1/businesses/{biz_id}/unlock",
        json={"password": "store-secret-pin-123"},
        headers=AUTH_HEADERS,
    )
    assert good_res.status_code == 200
    assert good_res.json()["unlocked"] is True


def test_set_password_on_unprotected_store():
    """Verify setting a password on an existing store that initially has no password."""
    # Create unprotected business directly in fallback store
    unprotected = mem_create_business(TEST_USER_ID, "Unprotected Store", "unprotected-store", "NGN")
    biz_id = unprotected["id"]
    assert unprotected["has_password"] is False

    # Setting password on unprotected store should not require current_password
    set_res = client.post(
        f"/api/v1/businesses/{biz_id}/set-password",
        json={"new_password": "new-pin-999"},
        headers=AUTH_HEADERS,
    )
    assert set_res.status_code == 200, set_res.text
    assert set_res.json()["has_password"] is True

    # Now verify unlocking works with the new password
    unlock_res = client.post(
        f"/api/v1/businesses/{biz_id}/unlock",
        json={"password": "new-pin-999"},
        headers=AUTH_HEADERS,
    )
    assert unlock_res.status_code == 200
    assert unlock_res.json()["unlocked"] is True


def test_change_password_with_current_password_verification():
    """Verify changing password requires valid current_password."""
    create_res = client.post(
        "/api/v1/businesses",
        json={
            "name": "Change Pass Mart",
            "currency": "NGN",
            "password": "initial-password-111",
        },
        headers=AUTH_HEADERS,
    )
    biz_id = create_res.json()["id"]

    # Missing current_password should return 400
    missing_curr = client.post(
        f"/api/v1/businesses/{biz_id}/set-password",
        json={"new_password": "second-password-222"},
        headers=AUTH_HEADERS,
    )
    assert missing_curr.status_code == 400

    # Wrong current_password should return 401
    wrong_curr = client.post(
        f"/api/v1/businesses/{biz_id}/set-password",
        json={
            "current_password": "wrong-initial-password",
            "new_password": "second-password-222",
        },
        headers=AUTH_HEADERS,
    )
    assert wrong_curr.status_code == 401
    assert "Current password is incorrect" in wrong_curr.json()["detail"]

    # Correct current_password changes password
    success_res = client.post(
        f"/api/v1/businesses/{biz_id}/set-password",
        json={
            "current_password": "initial-password-111",
            "new_password": "second-password-222",
        },
        headers=AUTH_HEADERS,
    )
    assert success_res.status_code == 200

    # Old password no longer works
    old_unlock = client.post(
        f"/api/v1/businesses/{biz_id}/unlock",
        json={"password": "initial-password-111"},
        headers=AUTH_HEADERS,
    )
    assert old_unlock.status_code == 401

    # New password works
    new_unlock = client.post(
        f"/api/v1/businesses/{biz_id}/unlock",
        json={"password": "second-password-222"},
        headers=AUTH_HEADERS,
    )
    assert new_unlock.status_code == 200
    assert new_unlock.json()["unlocked"] is True
