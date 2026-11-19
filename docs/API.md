# OJAPILOT API Specification

This document outlines the API design conventions, authentication headers, error handling, and initial endpoints for the OJAPILOT backend service.

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

The backend extracts and verifies the claims, ensuring tenant identification and propagating the user's role to Supabase RLS.

---

## 3. Standard Response Envelope

Successful requests return a standard JSON payload:

```json
{
  "status": "ok",
  "data": { ... },
  "message": "Optional descriptive status message"
}
```

Error responses return:

```json
{
  "status": "error",
  "code": "RESOURCE_NOT_FOUND",
  "detail": "Descriptive reason for failure",
  "timestamp": "2026-11-19T12:00:00Z"
}
```

---

## 4. Endpoints Overview

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

### Core Module Roadmap (v1)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/health` | Service health status | No |
| `POST` | `/api/v1/copilot/chat` | Conversational business copilot endpoint | Yes |
| `GET` | `/api/v1/copilot/proposals` | List pending AI action proposals | Yes |
| `POST` | `/api/v1/copilot/proposals/{id}/approve` | Approve and execute proposal | Yes |
| `POST` | `/api/v1/copilot/proposals/{id}/reject` | Reject proposal with reason | Yes |
| `GET` | `/api/v1/inventory` | Retrieve stock levels and reorder alerts | Yes |
| `POST` | `/api/v1/inventory/adjust` | Record stock movement / adjustment | Yes |
| `GET` | `/api/v1/sales/orders` | Query sales order history | Yes |
| `POST` | `/api/v1/sales/orders` | Record new retail/B2B sale | Yes |
