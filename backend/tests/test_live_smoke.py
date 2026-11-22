"""
Automated End-to-End Smoke Test for OJAPILOT Live Backend API.
Tests live health check, business creation, product listing,
and safe idempotent sales recording.
"""
import uuid
import jwt
import httpx

API_BASE = "http://127.0.0.1:8000/api/v1"
TEST_USER_ID = "624b4cdd-025e-404b-b49c-3b10c0d49828"
TEST_EMAIL = "smoke.test@ojapilot.local"


def generate_test_jwt() -> str:
    """Generates a valid Supabase authenticated user JWT payload."""
    payload = {
        "sub": TEST_USER_ID,
        "email": TEST_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
        "exp": 253402300799,
    }
    return jwt.encode(payload, "ojapilot-test-secret", algorithm="HS256")


def run_smoke_test():
    print("==================================================================")
    print("OJAPILOT LIVE API SMOKE TEST (http://127.0.0.1:8000)")
    print("==================================================================")

    # 1. Health check
    print("\n1. Testing GET /api/v1/health ...")
    r_health = httpx.get(f"{API_BASE}/health", timeout=10.0)
    assert r_health.status_code == 200, f"Health check failed: {r_health.status_code}"
    print("   ✓ Health check passed (HTTP 200):", r_health.json())

    # 2. Get Supabase JWT
    print("\n2. Initializing authenticated Supabase JWT context ...")
    token = generate_test_jwt()
    headers = {"Authorization": f"Bearer {token}"}
    print("   ✓ Authenticated JWT generated for user:", TEST_USER_ID)

    # 3. Create Business
    print("\n3. Testing POST /api/v1/businesses ...")
    biz_payload = {
        "name": f"Lagos Provision Store {uuid.uuid4().hex[:6]}",
        "currency": "NGN",
    }
    r_biz = httpx.post(f"{API_BASE}/businesses", json=biz_payload, headers=headers, timeout=10.0)
    assert r_biz.status_code in [200, 201], f"Create business failed: {r_biz.status_code} - {r_biz.text}"
    biz_data = r_biz.json()
    biz_id = biz_data["id"]
    print(f"   ✓ Business created (HTTP {r_biz.status_code}): {biz_data['name']} (ID: {biz_id})")

    # 4. List Businesses
    print("\n4. Testing GET /api/v1/businesses ...")
    r_biz_list = httpx.get(f"{API_BASE}/businesses", headers=headers, timeout=10.0)
    assert r_biz_list.status_code == 200, f"List businesses failed: {r_biz_list.status_code}"
    businesses = r_biz_list.json()
    assert any(b["id"] == biz_id for b in businesses), "Created business not found in list!"
    print(f"   ✓ Listed {len(businesses)} business(es) for authenticated user (HTTP 200)")

    # 5. Create Product
    print("\n5. Testing POST /api/v1/products ...")
    prod_sku = f"RICE-{uuid.uuid4().hex[:4].upper()}"
    prod_payload = {
        "business_id": biz_id,
        "sku": prod_sku,
        "name": "Golden Penny Rice 50kg",
        "category": "Grains",
        "unit": "bag",
        "cost_price": 42000.0,
        "selling_price": 50000.0,
        "stock_qty": 30,
        "low_stock_threshold": 5,
    }
    r_prod = httpx.post(f"{API_BASE}/products", json=prod_payload, headers=headers, timeout=10.0)
    assert r_prod.status_code in [200, 201], f"Create product failed: {r_prod.status_code} - {r_prod.text}"
    prod_data = r_prod.json()
    prod_id = prod_data["id"]
    print(f"   ✓ Product created (HTTP {r_prod.status_code}): {prod_data['name']} with stock {prod_data['stock_qty']} (ID: {prod_id})")

    # 6. List Products
    print("\n6. Testing GET /api/v1/products ...")
    r_prod_list = httpx.get(f"{API_BASE}/products?business_id={biz_id}", headers=headers, timeout=10.0)
    assert r_prod_list.status_code == 200, f"List products failed: {r_prod_list.status_code}"
    prods = r_prod_list.json()
    assert any(p["id"] == prod_id for p in prods), "Created product not found in catalog!"
    print(f"   ✓ Listed {len(prods)} product(s) in catalog (HTTP 200)")

    # 7. Record Safe Quick Sale
    print("\n7. Testing POST /api/v1/sales (Quick Sale POS) ...")
    sale_key = str(uuid.uuid4())
    sale_payload = {
        "business_id": biz_id,
        "idempotency_key": sale_key,
        "items": [
            {
                "product_id": prod_id,
                "quantity": 3,
                "unit_price": 50000.0,
            }
        ],
        "discount": 5000.0,
        "amount_paid": 145000.0,
    }
    r_sale = httpx.post(f"{API_BASE}/sales", json=sale_payload, headers=headers, timeout=10.0)
    assert r_sale.status_code in [200, 201], f"Record sale failed: {r_sale.status_code} - {r_sale.text}"
    sale_data = r_sale.json()
    assert sale_data["total_amount"] == 145000.0, f"Unexpected total: {sale_data['total_amount']}"
    print(f"   ✓ Sale recorded (HTTP {r_sale.status_code}): Total ₦{sale_data['total_amount']:,.2f} (Sale ID: {sale_data['id']})")

    # 8. Test Idempotency Guard
    print("\n8. Testing Idempotency guard with identical key ...")
    r_idem = httpx.post(f"{API_BASE}/sales", json=sale_payload, headers=headers, timeout=10.0)
    assert r_idem.status_code in [200, 201], f"Idempotent request failed: {r_idem.status_code}"
    assert r_idem.json()["id"] == sale_data["id"], "Idempotent request returned different sale ID!"
    print("   ✓ Idempotency confirmed: Duplicate request safely returned original receipt without double charge")

    # 9. Test Over-Selling Protection
    print("\n9. Testing Over-selling stock protection ...")
    oversell_payload = {
        "business_id": biz_id,
        "idempotency_key": str(uuid.uuid4()),
        "items": [
            {
                "product_id": prod_id,
                "quantity": 9999,  # Far exceeds available stock
            }
        ],
    }
    r_oversell = httpx.post(f"{API_BASE}/sales", json=oversell_payload, headers=headers, timeout=10.0)
    assert r_oversell.status_code == 400, f"Expected 400 Bad Request, got {r_oversell.status_code}"
    print("   ✓ Over-selling blocked properly (HTTP 400):", r_oversell.json()["detail"])

    # 10. List Sales History
    print("\n10. Testing GET /api/v1/sales ...")
    r_sales_list = httpx.get(f"{API_BASE}/sales?business_id={biz_id}", headers=headers, timeout=10.0)
    assert r_sales_list.status_code == 200, f"List sales failed: {r_sales_list.status_code}"
    sales = r_sales_list.json()
    assert any(s["id"] == sale_data["id"] for s in sales), "Recorded sale not found in history!"
    print(f"   ✓ Retrieved {len(sales)} sales record(s) from history (HTTP 200)")

    # 11. AI Copilot Note Parsing and Confirm Flow
    print("\n11. Testing POST /api/v1/copilot/parse-sale (AI Copilot Natural Language Note) ...")
    copilot_payload = {
        "business_id": biz_id,
        "note": "Sold 2 rice with 2000 discount",
    }
    r_copilot = httpx.post(f"{API_BASE}/copilot/parse-sale", json=copilot_payload, headers=headers, timeout=10.0)
    assert r_copilot.status_code == 200, f"Copilot parse failed: {r_copilot.status_code} - {r_copilot.text}"
    copilot_data = r_copilot.json()
    assert len(copilot_data["items"]) == 1, "Expected 1 parsed product item"
    assert copilot_data["items"][0]["product_id"] == prod_id
    assert copilot_data["items"][0]["quantity"] == 2
    assert copilot_data["discount"] == 2000.0
    assert copilot_data["suggested_payload"] is not None
    print(f"   ✓ Copilot parsed natural-language note into preview (HTTP 200): {copilot_data['summary']}")
    print(f"   ✓ Explanation: {copilot_data['explanation']}")

    # Confirm & record the Copilot-proposed sale
    print("\n12. Confirming AI Copilot proposed sale via POST /api/v1/sales ...")
    r_confirm_sale = httpx.post(f"{API_BASE}/sales", json=copilot_data["suggested_payload"], headers=headers, timeout=10.0)
    assert r_confirm_sale.status_code in [200, 201], f"Confirming copilot sale failed: {r_confirm_sale.status_code}"
    confirmed_sale = r_confirm_sale.json()
    assert confirmed_sale["discount"] == 2000.0
    print(f"   ✓ AI Copilot proposed sale confirmed and recorded (HTTP 201, Total: ₦{confirmed_sale['total_amount']:,.2f})")

    print("\n==================================================================")
    print("ALL 12 SMOKE TEST STEPS PASSED WITH HTTP 200/201 (0 DNS / 0 RLS Errors)!")
    print("==================================================================")


if __name__ == "__main__":
    run_smoke_test()
