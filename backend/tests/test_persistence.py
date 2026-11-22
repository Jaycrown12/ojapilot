"""
Tests for disk persistence across server restarts in OjaPilot.
Verifies that fallback businesses, products, stock levels, and sales transactions
are written to .fallback_data.json and survive server restarts 100% of the time.
"""
import json
import pytest
from fastapi.testclient import TestClient
import jwt

from app.main import app
from app.services.fallback_store import (
    FALLBACK_STORAGE_FILE,
    mem_create_business,
    mem_create_product,
    mem_update_product_stock,
    mem_create_sale,
    mem_list_businesses,
    mem_list_products,
    mem_list_sales,
    load_from_disk,
    _BUSINESSES,
    _PRODUCTS,
    _SALES,
    _BUSINESS_MEMBERS,
)

client = TestClient(app)

TEST_USER_ID = "624b4cdd-025e-404b-b49c-3b10c0d49828"
TEST_TOKEN = jwt.encode(
    {"sub": TEST_USER_ID, "email": "persist.test@ojapilot.local", "role": "authenticated"},
    "test-secret",
    algorithm="HS256",
)
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}


def test_fallback_store_disk_persistence():
    # 1. Create entities in fallback store
    biz = mem_create_business(TEST_USER_ID, "Disk Persist Supermarket", "disk-persist-mart", "NGN")
    biz_id = biz["id"]

    prod = mem_create_product({
        "business_id": biz_id,
        "sku": "PERSIST-01",
        "name": "Milo Tin 500g",
        "selling_price": 2500.0,
        "stock_qty": 50,
    })
    prod_id = prod["id"]

    # Deduct stock
    mem_update_product_stock(prod_id, 45)

    sale_data = {
        "business_id": biz_id,
        "customer_id": None,
        "idempotency_key": "persist-idem-123",
        "status": "completed",
        "subtotal": 12500.0,
        "discount": 500.0,
        "total_amount": 12000.0,
        "amount_paid": 12000.0,
        "balance_due": 0.0,
    }
    items_data = [{
        "product_id": prod_id,
        "product_name": "Milo Tin 500g",
        "quantity": 5,
        "unit_price": 2500.0,
        "line_total": 12500.0,
    }]
    sale = mem_create_sale(sale_data, items_data)
    sale_id = sale["id"]

    # 2. Check disk file exists and is valid JSON
    assert FALLBACK_STORAGE_FILE.exists(), f"Persistence file not found at {FALLBACK_STORAGE_FILE}"
    with open(FALLBACK_STORAGE_FILE, "r", encoding="utf-8") as f:
        disk_data = json.load(f)

    assert biz_id in disk_data["businesses"]
    assert prod_id in disk_data["products"]
    assert disk_data["products"][prod_id]["stock_qty"] == 45
    assert sale_id in disk_data["sales"]

    # 3. Simulate backend restart: wipe in-memory structures completely
    _BUSINESSES.clear()
    _PRODUCTS.clear()
    _SALES.clear()
    _BUSINESS_MEMBERS.clear()
    assert len(_BUSINESSES) == 0
    assert len(_PRODUCTS) == 0
    assert len(_SALES) == 0

    # 4. Trigger startup load
    load_from_disk()

    # Verify memory is restored from disk
    restored_biz = mem_list_businesses(TEST_USER_ID)
    assert any(b["id"] == biz_id for b in restored_biz)

    restored_prods = mem_list_products(biz_id)
    assert any(p["id"] == prod_id and p["stock_qty"] == 45 for p in restored_prods)

    restored_sales = mem_list_sales(biz_id)
    assert any(s["id"] == sale_id for s in restored_sales)

    # 5. Verify API endpoints serve restored data after restart
    resp_biz = client.get("/api/v1/businesses", headers=AUTH_HEADERS)
    assert resp_biz.status_code == 200
    assert any(b["id"] == biz_id for b in resp_biz.json())

    resp_prod = client.get(f"/api/v1/products?business_id={biz_id}", headers=AUTH_HEADERS)
    assert resp_prod.status_code == 200
    assert any(p["id"] == prod_id and p["stock_qty"] == 45 for p in resp_prod.json())

    resp_sales = client.get(f"/api/v1/sales?business_id={biz_id}", headers=AUTH_HEADERS)
    assert resp_sales.status_code == 200
    assert any(s["id"] == sale_id for s in resp_sales.json())
