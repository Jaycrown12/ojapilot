# OJAPILOT 🚀

> **AI-First Business & Inventory Copilot for Small and Medium Enterprises (SMEs)**

OJAPILOT empowers retail and wholesale merchants with an intelligent copilot that monitors inventory levels, forecasts reorder needs, automates sales bookkeeping, and drafts actionable business proposals with human-in-the-loop verification.

---

## 📁 Repository Structure

```
ojapilot/
├── frontend/             # Next.js App Router (TypeScript, Tailwind CSS)
│   ├── app/              # Routes: (auth), (dashboard), api, layout.tsx, page.tsx
│   ├── components/       # UI Components: copilot, dashboard, inventory, sales, shared
│   ├── hooks/            # Reusable React hooks
│   ├── lib/              # Client utilities and Supabase client setup
│   └── types/            # TypeScript interfaces and shared types
├── backend/              # FastAPI Backend (Python 3.10+)
│   ├── app/              # Core application code
│   │   ├── ai/           # Gemini LLM prompts, reasoning, and tool schemas
│   │   ├── api/v1/       # REST API endpoints & route handlers
│   │   ├── core/         # Configuration, security, and logging
│   │   ├── models/       # Database models / ORM definitions
│   │   ├── schemas/      # Pydantic validation schemas
│   │   ├── services/     # Domain business logic (Inventory, Sales, Copilot)
│   │   ├── workflows/    # Multi-step business workflows & HITL orchestration
│   │   └── main.py       # FastAPI application entrypoint with CORS & health endpoint
│   ├── tests/            # Pytest test suite
│   └── requirements.txt  # Python package dependencies
├── database/             # PostgreSQL database definitions
│   ├── migrations/       # Incremental database migrations
│   ├── seeds/            # Sample development seed datasets
│   └── schema.sql        # Baseline PostgreSQL schema with RLS policies
├── docs/                 # Architectural and technical documentation
│   ├── ARCHITECTURE.md   # System architecture, JWT forwarding, HITL proposals
│   ├── API.md            # API routes, contracts, and authentication
│   └── DATABASE.md       # Multi-tenant data model and RLS guidelines
├── .env.example          # Template environment variables
├── .gitignore            # Git ignore specification
└── README.md             # Project overview and quickstart guide
```

---

## ⚡ Quickstart

### 1. Prerequisites
- **Node.js**: v18.17.0+ (v20+ recommended)
- **Python**: v3.10+
- **Supabase Account / Local CLI** (for PostgreSQL & Auth)

### 2. Environment Setup
Copy the example environment file and configure your keys:
```bash
cp .env.example .env
```

### 3. Running the Backend (FastAPI)
Navigate to the `backend/` folder, set up a virtual environment, and install dependencies:

```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- API Base URL: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/v1/health`

### 4. Running the Frontend (Next.js)
In a separate terminal, navigate to the `frontend/` folder, install dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```
- Frontend Web App: `http://localhost:3000`

---

## 🔒 Security Architecture Highlights
- **Zero Frontend Leaks**: Service role keys and AI API credentials remain strictly confined to the backend.
- **JWT Forwarding to Supabase RLS**: User authentication tokens are forwarded to Supabase, guaranteeing multi-tenant isolation at the database layer.
- **Human-in-the-Loop AI**: Business-critical updates (stock deductions, bulk reorders, price adjustments) require explicit human approval via structured proposals.
