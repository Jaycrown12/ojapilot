# OJAPILOT 🚀

> **AI-First Multi-Tenant Retail & Inventory Copilot for SMEs**

OJAPILOT empowers retail merchants, supermarket owners, pharmacies, and wholesale distributors with an intelligent, multi-tenant inventory and sales copilot. It transforms everyday natural-language spoken or typed notes (e.g., *"Sold 2 Peak milk and 1 bread with 500 discount"*) into structured inventory deductions, audit movements, idempotent POS receipts, and real-time business KPI insights with human-in-the-loop verification.

---

## 🌟 Core Features Implemented & Verified

### 1. 🏢 Multi-Tenant Store Workspaces & Isolation
- **Tenant Management**: Instantly create and switch between distinct business workspaces (e.g., *Lagos Provision Store*, *Abuja Electronics*).
- **Tenant Isolation**: Secure role-based membership (`owner`, `admin`, `manager`, `staff`) with PostgreSQL Row-Level Security (RLS) policies enforced via forwarded Supabase Bearer JWT tokens.

### 2. 📦 Inventory Management with Low-Stock Alerting
- **Real-Time Catalog**: Manage product SKUs, units, cost prices, selling prices, and live stock levels.
- **Dynamic Threshold Alerts**: Configurable `low_stock_threshold` triggers automated visual indicators (`⚠️ Low` and `Needs Restock Alert`) in the inventory table and KPI banner whenever inventory runs thin.
- **Stock Depletion Guards**: Prevents negative stock balances and logs inventory movement deltas upon every completed sale.

### 3. ⚡ Idempotent Quick-Sale POS
- **Double-Billing Protection**: Client-generated UUID `idempotency_key` guarantees duplicate network requests return the original receipt rather than double-charging.
- **Overselling Guard**: Rejects sales with `HTTP 400 Bad Request` if requested quantity exceeds available inventory.
- **Automatic Accounting**: Automatically computes subtotals, line items, item discounts, and balance due.

### 4. ✨ Dual-Engine AI Sales Copilot (Gemini LLM + Deterministic Engine)
- **Gemini LLM Reasoning**: Seamlessly parses nuanced natural language sales notes when `GEMINI_API_KEY` is configured, bounded by a strict 1.2-second timeout.
- **Deterministic Nigerian Retail NLP Fallback**: Guaranteed $<5\text{ ms}$ fallback engine that operates with zero external network dependencies so **it never fails during offline demos**.
  - Maps word numbers (*"two"*, *"three"*, *"dozen"*).
  - Handles Nigerian and general retail colloquialisms (*"coke"* $\rightarrow$ *"Coca Cola"*, *"rice"* $\rightarrow$ *"Golden Penny Rice"*, *"indomie"* $\rightarrow$ *"noodles"*).
  - Extracts flexible discount syntax (*"with 1000 discount"*, *"less 500"*, *"minus 200 naira"*).
  - Handles price overrides (*"@ 44000 each"*).
- **Human-in-the-Loop Proposal Preview**: Formats parsed notes into an itemized visual proposal displaying matched items, unit prices, line totals, and stock availability before the merchant clicks to execute.

### 5. 📊 Live Store KPI Summary Bar
- Situated right below the active workspace header with real-time reactive metric cards:
  - **Total Revenue (NGN)**: Sum of all recorded sales totals with live pulse indicator.
  - **Sales Recorded**: Transaction count badge of completed sales.
  - **Low Stock Items**: Real-time counter that automatically switches to an amber warning banner (`⚠️ Needs Restock Alert`) when inventory dips below threshold.

### 6. 🛡️ High-Availability Persistence (Supabase PostgreSQL + Atomic Local Disk)
- **Supabase Cloud Synchronization**: Persists to remote Supabase PostgreSQL with RLS when connected.
- **Local Disk Resilience (`backend/.fallback_data.json`)**: Automatically writes every business, product, stock update, and sale to an atomic JSON disk backup on every write and reloads on startup. **100% of store data survives backend reboots and server restarts.**

---

## 📁 Repository Structure

```
ojapilot/
├── frontend/                     # Next.js 14 App Router (TypeScript, Tailwind CSS)
│   ├── app/                      # Routes: /login, /dashboard, layout.tsx, page.tsx
│   ├── components/               # Modular UI components (copilot, inventory, sales, shared)
│   ├── lib/                      # Supabase client, authenticated API fetch wrapper
│   └── types/                    # Shared TypeScript interfaces (Product, Sale, CopilotParseResponse)
├── backend/                      # FastAPI Backend Service (Python 3.10+)
│   ├── app/
│   │   ├── ai/                   # AI Copilot engine (Gemini LLM + deterministic retail NLP)
│   │   ├── api/v1/               # Endpoints: /health, /businesses, /products, /sales, /copilot
│   │   ├── core/                 # Config (pydantic-settings), JWT auth dependencies, Supabase clients
│   │   ├── schemas/              # Pydantic schemas (Business, Product, Sale, Copilot)
│   │   ├── services/             # Fallback persistence engine (.fallback_data.json)
│   │   └── main.py               # FastAPI entrypoint with CORS & API v1 mounting
│   ├── tests/                    # Automated pytest suite & live API smoke test
│   │   ├── test_copilot.py       # Copilot NLP & endpoint tests
│   │   ├── test_feature_slice.py # Business slug, product, & sales validation tests
│   │   ├── test_health.py        # API health check tests
│   │   ├── test_persistence.py   # Disk persistence across restart tests
│   │   └── test_live_smoke.py    # 12-step end-to-end live smoke test
│   └── requirements.txt          # Python dependencies
├── database/                     # Supabase PostgreSQL architecture
│   └── schema.sql                # Complete relational schema with RLS policies & audit logs
├── docs/                         # Technical documentation
│   ├── ARCHITECTURE.md           # Architecture principles, JWT forwarding, HITL proposals
│   ├── API.md                    # Detailed REST API specification
│   └── DATABASE.md               # PostgreSQL data model and multi-tenant RLS guidelines
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git ignore specifications
└── README.md                     # Project documentation & quickstart
```

---

## ⚡ Quickstart: Running Locally

### 1. Prerequisites
- **Node.js**: v18.17+ or v20+
- **Python**: v3.10+
- **npm** or **pnpm**

---

### 2. Environment Configuration
The project is configured out of the box with safe development defaults. Verify or create your environment files:

```bash
# Root environment file
cp .env.example .env

# Frontend environment file
cp .env.example frontend/.env.local
```

---

### 3. Start the Backend API (FastAPI — Port 8000)

```powershell
# Navigate to backend directory
cd backend

# Create and activate virtual environment (Windows PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# (On macOS/Linux: source .venv/bin/activate)

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Live API Base**: `http://127.0.0.1:8000/api/v1`
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **Health Endpoint**: `http://127.0.0.1:8000/api/v1/health`

---

### 4. Start the Frontend (Next.js — Port 3000)

In a separate terminal window:

```powershell
# Navigate to frontend directory
cd frontend

# Install packages
npm install

# Start Next.js development server
npm run dev
```
- **Web Application**: `http://localhost:3000`
- **Merchant Dashboard**: `http://localhost:3000/dashboard`
- **Login / Signup**: `http://localhost:3000/login`

---

## 🧪 Running Automated Tests

### 1. Pytest Test Suite (11 Unit & Integration Tests)
Runs full validation across health diagnostics, business slug generation, product creation, idempotent sales, AI Copilot parsing, and atomic disk persistence:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/
```
*Expected Result: `11 passed`*

### 2. Live End-to-End Smoke Test (12 Real API Verification Steps)
Executes against the running backend on port 8000, creating a live tenant, adding products, executing sales, testing idempotency, testing overselling guards, testing natural-language Copilot parsing, and confirming the proposal into sales history:

```powershell
cd backend
.\.venv\Scripts\python.exe tests/test_live_smoke.py
```
*Expected Result: `ALL 12 SMOKE TEST STEPS PASSED WITH HTTP 200/201 (0 DNS / 0 RLS Errors)!`*

### 3. Frontend Typecheck & Build
```powershell
cd frontend
npx tsc --noEmit
npm run build
```
*Expected Result: `Compiled successfully with 0 errors`*

---

## ⏱️ 60-Second Demo Walkthrough

Follow these 4 quick steps to test OJAPILOT end-to-end:

1. **Open the Dashboard**:
   - Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) in your browser (if prompted, sign up or log in at `/login`).
   - If no workspace exists yet, type your store name (e.g., *"Lagos Superstore"*) and click **Create Business**.

2. **Add a Product to Inventory**:
   - In the **Add Product to Inventory** form on the left, enter:
     - **Name**: `Peak Milk 400g`
     - **SKU**: `PM-400`
     - **Selling Price**: `1500`
     - **Stock Quantity**: `20`
     - **Low Stock Threshold**: `5`
   - Click **Save Product to Catalog**. The product will appear immediately in your stock catalog with a healthy green badge.

3. **Try the AI Sales Copilot**:
   - Look at the **AI Sales Copilot** card on the top right.
   - Click one of the quick prompt chips: `Sold 2 Peak milk` (or type *"Sold 2 Peak milk with 200 discount"*).
   - Click **✨ Parse with Copilot**.
   - Notice the instant proposal preview:
     - Matched: `2x Peak Milk 400g` at `₦1,500.00`
     - Discount: `₦200.00`
     - Total: `₦2,800.00`

4. **Confirm & Inspect Real-Time KPIs**:
   - Click **✓ Confirm & Record Sale**.
   - Notice what happens instantly:
     - **Total Revenue**: Increases by `₦2,800.00`.
     - **Sales Recorded**: Increments by `1`.
     - **Stock Quantity**: Decrements from `20` to `18`.
     - **Recent Sales**: Prepend the completed receipt to transaction history.

---

## 🔒 Security & Data Integrity Highlights
- **Zero Key Leaks**: Supabase service role keys and Gemini API keys are strictly confined to server-side backend processes; client bundles never expose sensitive credentials.
- **Idempotency Guarantee**: Unique client UUIDs ensure no duplicate sales or inventory double-deductions occur over unstable mobile connections.
- **Human-in-the-Loop Safeguards**: AI proposals are transparently previewed with itemized costs and stock checks prior to execution.
- **Persistent Resilience**: Server reboots load state from `.fallback_data.json` automatically, preventing merchant data loss.
