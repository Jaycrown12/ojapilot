import io
import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.business import BusinessCreate, generate_slug
from app.schemas.product import ProductCreate
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services.fallback_store import mem_create_business

client = TestClient(app)

TEST_USER_ID = "624b4cdd-025e-404b-b49c-3b10c0d49828"
TEST_TOKEN = jwt.encode(
    {"sub": TEST_USER_ID, "email": "test@ojapilot.local", "role": "authenticated"},
    "test-secret",
    algorithm="HS256",
)
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_unauthenticated_endpoints_require_bearer_token():
    """Endpoints must block requests without Authorization Bearer header."""
    res_biz = client.get("/api/v1/businesses")
    assert res_biz.status_code == 401

    res_prod = client.get("/api/v1/products?business_id=123")
    assert res_prod.status_code == 401

    res_sales = client.post("/api/v1/sales", json={})
    assert res_sales.status_code == 401


def test_business_slug_generation():
    """Verify clean URL-friendly slug generation."""
    slug = generate_slug("Lagos Super Store & Sons!")
    assert slug == "lagos-super-store-sons"

    biz = BusinessCreate(name="Abuja Electronics Market")
    assert biz.slug == "abuja-electronics-market"
    assert biz.currency == "NGN"


def test_product_schema_validation():
    """Validate stock_qty cannot be negative."""
    with pytest.raises(Exception):
        ProductCreate(
            business_id="123e4567-e89b-12d3-a456-426614174000",
            sku="INVALID-SKU",
            name="Negative Stock Item",
            selling_price=100.0,
            stock_qty=-5,
        )


def test_sale_item_schema_validation():
    """Validate sale item quantity must be strictly greater than 0."""
    with pytest.raises(Exception):
        SaleItemCreate(
            product_id="123e4567-e89b-12d3-a456-426614174000",
            quantity=0,
            unit_price=50.0,
        )


def test_product_image_upload():
    """Upload product image endpoint saves file and returns valid static URL."""
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("test_product.png", io.BytesIO(fake_png), "image/png")}
    res = client.post("/api/v1/products/upload-image", files=files, headers=AUTH_HEADERS)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "image_url" in data
    assert "/static/product_images/" in data["image_url"]


def test_product_create_and_patch_update():
    """Verify creating a product with image_url and updating via PATCH."""
    biz = mem_create_business(TEST_USER_ID, "Update Test Mart", "update-test-mart", "NGN")

    # Create product
    prod_payload = {
        "business_id": biz["id"],
        "sku": "PEAK-CAN-01",
        "name": "Peak Evaporated Milk",
        "selling_price": 600.0,
        "cost_price": 450.0,
        "stock_qty": 30,
        "low_stock_threshold": 8,
        "image_url": "http://127.0.0.1:8000/static/product_images/sample.png",
    }
    create_res = client.post("/api/v1/products", json=prod_payload, headers=AUTH_HEADERS)
    assert create_res.status_code == 201, create_res.text
    prod = create_res.json()
    assert prod["name"] == "Peak Evaporated Milk"
    assert prod["image_url"] == prod_payload["image_url"]
    assert prod["stock_qty"] == 30

    # Patch product
    patch_payload = {
        "name": "Peak Evaporated Milk (160g)",
        "selling_price": 650.0,
        "stock_quantity": 45,
        "image_url": "http://127.0.0.1:8000/static/product_images/updated.png",
    }
    patch_headers = {**AUTH_HEADERS, "X-Business-Id": biz["id"]}
    patch_res = client.patch(f"/api/v1/products/{prod['id']}", json=patch_payload, headers=patch_headers)
    assert patch_res.status_code == 200, patch_res.text
    updated = patch_res.json()
    assert updated["name"] == "Peak Evaporated Milk (160g)"
    assert updated["selling_price"] == 650.0
    assert updated["stock_qty"] == 45
    assert updated["image_url"] == "http://127.0.0.1:8000/static/product_images/updated.png"

    # Verify list products returns updated fields
    list_res = client.get(f"/api/v1/products?business_id={biz['id']}", headers=AUTH_HEADERS)
    assert list_res.status_code == 200
    prods = list_res.json()
    found = next(p for p in prods if p["id"] == prod["id"])
    assert found["name"] == "Peak Evaporated Milk (160g)"
    assert found["selling_price"] == 650.0
    assert found["stock_qty"] == 45
    assert found["image_url"] == "http://127.0.0.1:8000/static/product_images/updated.png"

