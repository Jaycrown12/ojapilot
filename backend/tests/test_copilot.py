"""
Unit and Integration tests for OjaPilot AI Copilot feature.
"""
import pytest
from fastapi.testclient import TestClient
import jwt

from app.main import app
from app.ai.copilot import parse_sale_deterministic
from app.services.fallback_store import mem_create_business, mem_create_product

client = TestClient(app)

TEST_USER_ID = "624b4cdd-025e-404b-b49c-3b10c0d49828"
TEST_TOKEN = jwt.encode(
    {"sub": TEST_USER_ID, "email": "copilot.test@ojapilot.local", "role": "authenticated"},
    "test-secret",
    algorithm="HS256",
)
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture
def sample_products():
    return [
        {"id": "prod-1", "name": "Peak Milk 400g", "sku": "PM-400", "selling_price": 1500.0, "stock_qty": 20},
        {"id": "prod-2", "name": "Golden Penny Rice 50kg", "sku": "GPR-50", "selling_price": 45000.0, "stock_qty": 10},
        {"id": "prod-3", "name": "Agege Bread", "sku": "AB-01", "selling_price": 800.0, "stock_qty": 30},
        {"id": "prod-4", "name": "Coca Cola 50cl", "sku": "CC-50", "selling_price": 400.0, "stock_qty": 50},
    ]


def test_copilot_deterministic_single_item(sample_products):
    res = parse_sale_deterministic("Sold 2 Peak milk", sample_products, "biz-1")
    assert len(res.items) == 1
    assert res.items[0].product_name == "Peak Milk 400g"
    assert res.items[0].quantity == 2
    assert res.items[0].unit_price == 1500.0
    assert res.items[0].line_total == 3000.0
    assert res.subtotal == 3000.0
    assert res.total_amount == 3000.0
    assert res.suggested_payload is not None
    assert res.suggested_payload.business_id == "biz-1"
    assert len(res.suggested_payload.items) == 1


def test_copilot_deterministic_multi_item_and_synonyms(sample_products):
    res = parse_sale_deterministic("3 bread and 1 coke", sample_products, "biz-1")
    assert len(res.items) == 2
    names = [it.product_name for it in res.items]
    assert "Agege Bread" in names
    assert "Coca Cola 50cl" in names
    assert res.subtotal == (3 * 800.0) + (1 * 400.0)
    assert res.total_amount == 2800.0


def test_copilot_deterministic_discount(sample_products):
    res = parse_sale_deterministic("Sold 2 rice with 1000 discount", sample_products, "biz-1")
    assert len(res.items) == 1
    assert res.items[0].product_name == "Golden Penny Rice 50kg"
    assert res.items[0].quantity == 2
    assert res.subtotal == 90000.0
    assert res.discount == 1000.0
    assert res.total_amount == 89000.0
    assert res.suggested_payload.discount == 1000.0


def test_copilot_endpoint_e2e():
    # Setup business and product in store
    biz = mem_create_business(TEST_USER_ID, "Copilot Test Mart", "copilot-test-mart", "NGN")
    prod = mem_create_product({
        "business_id": biz["id"],
        "sku": "MILK-01",
        "name": "Peak Milk 400g",
        "selling_price": 1600.0,
        "stock_qty": 25,
    })

    payload = {
        "business_id": biz["id"],
        "note": "Sold 3 Peak milk with 200 discount",
    }
    response = client.post("/api/v1/copilot/parse-sale", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["business_id"] == biz["id"]
    assert len(data["items"]) == 1
    assert data["items"][0]["product_id"] == prod["id"]
    assert data["items"][0]["quantity"] == 3
    assert data["items"][0]["unit_price"] == 1600.0
    assert data["subtotal"] == 4800.0
    assert data["discount"] == 200.0
    assert data["total_amount"] == 4600.0
    assert data["suggested_payload"] is not None
    assert data["suggested_payload"]["idempotency_key"] is not None


def test_copilot_credit_and_customer_parsing(sample_products):
    res = parse_sale_deterministic("Mama Tunde bought 2 Peak milk owing 500", sample_products, "biz-1")
    assert res.customer_name == "Mama Tunde"
    assert len(res.items) == 1
    assert res.items[0].product_name == "Peak Milk 400g"
    assert res.items[0].quantity == 2
    assert res.total_amount == 3000.0
    assert res.balance_due == 500.0
    assert res.amount_paid == 2500.0
    assert res.payment_status == "partial"
    assert res.suggested_payload is not None
    assert res.suggested_payload.customer_name == "Mama Tunde"
    assert res.suggested_payload.balance_due == 500.0
    assert res.suggested_payload.amount_paid == 2500.0


def test_copilot_full_credit_parsing(sample_products):
    res = parse_sale_deterministic("Sold 3 bread on credit", sample_products, "biz-1")
    assert len(res.items) == 1
    assert res.items[0].product_name == "Agege Bread"
    assert res.items[0].quantity == 3
    assert res.total_amount == 2400.0
    assert res.balance_due == 2400.0
    assert res.amount_paid == 0.0
    assert res.payment_status == "credit"


def test_copilot_explicit_paid_parsing(sample_products):
    res = parse_sale_deterministic("Customer Emeka paid 2000 for 2 Peak milk", sample_products, "biz-1")
    assert res.customer_name == "Emeka"
    assert len(res.items) == 1
    assert res.items[0].product_name == "Peak Milk 400g"
    assert res.total_amount == 3000.0
    assert res.amount_paid == 2000.0
    assert res.balance_due == 1000.0
    assert res.payment_status == "partial"


def test_credit_sale_record_and_list_e2e():
    biz = mem_create_business(TEST_USER_ID, "Credit Test Mart", "credit-test-mart", "NGN")
    prod = mem_create_product({
        "business_id": biz["id"],
        "sku": "BREAD-01",
        "name": "Agege Bread",
        "selling_price": 800.0,
        "stock_qty": 50,
    })

    # 1. Parse note
    parse_resp = client.post(
        "/api/v1/copilot/parse-sale",
        json={"business_id": biz["id"], "note": "Mama Tunde bought 2 bread owing 600"},
        headers=AUTH_HEADERS,
    )
    assert parse_resp.status_code == 200
    parse_data = parse_resp.json()
    assert parse_data["customer_name"] == "Mama Tunde"
    assert parse_data["balance_due"] == 600.0
    assert parse_data["amount_paid"] == 1000.0

    # 2. Record sale using suggested payload
    sale_payload = parse_data["suggested_payload"]
    sale_resp = client.post("/api/v1/sales", json=sale_payload, headers=AUTH_HEADERS)
    assert sale_resp.status_code == 201, sale_resp.text
    sale_data = sale_resp.json()
    assert sale_data["customer_name"] == "Mama Tunde"
    assert sale_data["total_amount"] == 1600.0
    assert sale_data["amount_paid"] == 1000.0
    assert sale_data["balance_due"] == 600.0
    assert sale_data["payment_status"] == "partial"

    # 3. List sales to verify balance_due and customer_name are returned
    list_resp = client.get(f"/api/v1/sales?business_id={biz['id']}", headers=AUTH_HEADERS)
    assert list_resp.status_code == 200
    sales = list_resp.json()
    assert len(sales) >= 1
    found = next(s for s in sales if s["id"] == sale_data["id"])
    assert found["customer_name"] == "Mama Tunde"
    assert found["balance_due"] == 600.0
    assert found["amount_paid"] == 1000.0
    assert found["payment_status"] == "partial"
