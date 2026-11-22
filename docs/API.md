# OJAPILOT API Specification

This document outlines the API design conventions, authentication headers, error handling, and core endpoints for the OJAPILOT backend service.

---

## 1. General Conventions

- **Base URL**: `http://localhost:8000/api/v1` (configurable via `NEXT_PUBLIC_API_BASE_URL`)
- **Transport**: HTTPS in production, HTTP for local development.
- **Content-Type**: `application/json`
- **Date Format**: ISO 8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ`)

---

## 2. Authentication

Requests requiring user context must provide the Supabase Access Token in the HTTP Authorization header:

```http
Authorization: Bearer <SUPABASE_USER_JWT>
```

The backend extracts the claims, initializes a user-scoped Supabase client, and enforces PostgreSQL Row Level Security (RLS) under `auth.uid()`.

---

## 3. Endpoints Overview

### Health & Diagnostics

#### `GET /api/v1/health`
Checks backend operational status and service availability.
- **Auth Required**: No
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "ojapilot-api"
  }
  ```

---

### Businesses (Multi-Tenancy)

#### `POST /api/v1/businesses`
Creates a new business tenant and automatically assigns the authenticated user as the `'owner'` in `business_members`.
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "name": "Lagos Provision Store",
    "slug": "lagos-provision-store",
    "currency": "NGN"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "id": "e4b3c2a1-...",
    "name": "Lagos Provision Store",
    "slug": "lagos-provision-store",
    "currency": "NGN",
    "role": "owner"
  }
  ```

#### `GET /api/v1/businesses`
Lists all business tenants where the authenticated user is an active member.
- **Auth Required**: Yes (`Bearer <token>`)

---

### Products & Inventory

#### `POST /api/v1/products`
Creates a product record within the specified business. Validates `stock_qty >= 0` and logs an initial `inventory_movements` ledger entry if `stock_qty > 0`.
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "business_id": "e4b3c2a1-...",
    "sku": "RICE-50KG",
    "name": "Golden Penny Rice 50kg",
    "category": "Grains",
    "unit": "bag",
    "cost_price": 45000.00,
    "selling_price": 52000.00,
    "stock_qty": 20,
    "low_stock_threshold": 5
  }
  ```
- **Response `201 Created`**: Returns product details with updated stock count.

#### `GET /api/v1/products?business_id={uuid}`
Lists inventory products belonging to the specified business. Protected by PostgreSQL RLS.
- **Auth Required**: Yes (`Bearer <token>`)

---

### Sales Transactions (POS & Safe Stock Deduction)

#### `POST /api/v1/sales`
Records a completed sale safely:
1. Validates `idempotency_key` (UUID) to block duplicate billing.
2. Checks stock availability; rejects if `quantity > stock_qty`.
3. Reduces `stock_qty` on products.
4. Records `inventory_movements` audit ledger records.
5. Records payment entry.
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "business_id": "e4b3c2a1-...",
    "idempotency_key": "c7a8b9d0-...",
    "customer_id": null,
    "items": [
      {
        "product_id": "99f8e7d6-...",
        "quantity": 2,
        "unit_price": 52000.00
      }
    ],
    "discount": 1000.00,
    "amount_paid": 103000.00
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "id": "11223344-...",
    "business_id": "e4b3c2a1-...",
    "status": "completed",
    "subtotal": 104000.00,
    "discount": 1000.00,
    "total_amount": 103000.00,
    "amount_paid": 103000.00,
    "balance_due": 0.00,
    "items": [ ... ]
  }
  ```

#### `GET /api/v1/sales?business_id={uuid}&limit=20`
Lists recent sales transactions with itemized line items.
- **Auth Required**: Yes (`Bearer <token>`)

---

### AI Copilot (Natural-Language Sales & Inventory Assistant)

#### `POST /api/v1/copilot/parse-sale`
Parses spoken or typed natural language retail notes (e.g., *"Sold 2 Peak milk and 1 bread with 500 discount"*) into an itemized, human-in-the-loop sales proposal ready for immediate confirmation.
- **Auth Required**: Yes (`Bearer <token>`)
- **Resilience**: Employs Gemini LLM reasoning when configured; falls back deterministically in <5ms without network dependencies so it never fails during demos or offline usage.
- **Request Body**:
  ```json
  {
    "business_id": "e4b3c2a1-...",
    "note": "Sold 2 Peak milk and 1 bread with 500 discount"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "proposal_id": "9a8b7c6d-...",
    "business_id": "e4b3c2a1-...",
    "note": "Sold 2 Peak milk and 1 bread with 500 discount",
    "summary": "Sale of 2 item(s) for ₦3,300.00",
    "items": [
      {
        "product_id": "prod-1",
        "product_name": "Peak Milk 400g",
        "quantity": 2,
        "unit_price": 1500.0,
        "line_total": 3000.0,
        "available_stock": 20,
        "matched_text": "2 Peak milk"
      },
      {
        "product_id": "prod-3",
        "product_name": "Agege Bread",
        "quantity": 1,
        "unit_price": 800.0,
        "line_total": 800.0,
        "available_stock": 30,
        "matched_text": "1 bread"
      }
    ],
    "subtotal": 3800.0,
    "discount": 500.0,
    "total_amount": 3300.0,
    "unmatched_tokens": [],
    "explanation": "Matched 2 item(s): 2x Peak Milk 400g (₦1,500.00), 1x Agege Bread (₦800.00). Applied ₦500.00 discount. Total: ₦3,300.00.",
    "source": "deterministic_engine",
    "suggested_payload": {
      "business_id": "e4b3c2a1-...",
      "customer_id": null,
      "idempotency_key": "uuid-v4",
      "items": [
        { "product_id": "prod-1", "quantity": 2, "unit_price": 1500.0 },
        { "product_id": "prod-3", "quantity": 1, "unit_price": 800.0 }
      ],
      "discount": 500.0,
      "amount_paid": 3300.0
    }
  }
  ```
