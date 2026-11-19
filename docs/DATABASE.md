# OJAPILOT Database Architecture

OJAPILOT utilizes **PostgreSQL** hosted via **Supabase**, leveraging native **Row Level Security (RLS)**, real-time change data capture, and relational integrity.

---

## 1. Multi-Tenancy Strategy

Every SME operates within an isolated tenant environment identified by `organization_id` (or `store_id`).
- All core business tables (`products`, `inventory_items`, `stock_transactions`, `sales_orders`, `ai_proposals`) include an `organization_id` column.
- Supabase Auth identifies the authenticated user (`auth.uid()`), mapping them to one or more organizations via the `organization_members` table.
- PostgreSQL Row Level Security (RLS) ensures that queries cannot read or write records belonging to another organization.

---

## 2. Core Entities

### Organization & User Context
- **`organizations`**: Root tenant records for each SME business/store.
- **`profiles`**: Application profile data linked 1:1 with `auth.users`.
- **`organization_members`**: Join table defining user permissions (`owner`, `manager`, `staff`).

### Inventory & Catalog
- **`products`**: Master product catalog (SKU, title, category, unit, default price).
- **`inventory_items`**: Real-time warehouse/shelf stock count, safety threshold, and reorder point per product.
- **`stock_transactions`**: Ledger recording inventory movements (`PURCHASE_RECEIPT`, `SALE_DEDUCTION`, `MANUAL_ADJUSTMENT`, `RETURN`).

### Sales & Operations
- **`sales_orders`**: Header record for sales transactions.
- **`sales_order_items`**: Line items for orders linking product, quantity, unit price, and discounts.

### AI Copilot & Human-in-the-Loop
- **`ai_proposals`**: Staged actions formulated by the AI Copilot (`RESTOCK_ORDER`, `PRICE_UPDATE`, `STOCK_TRANSFER`), awaiting SME owner review and approval before execution.

---

## 3. Directory Structure

```
database/
├── migrations/         # Incremental SQL migration scripts
├── seeds/              # Seed data for local testing & development
└── schema.sql          # Unified baseline schema definition
```

---

## 4. Row Level Security (RLS) Rules

All tables have RLS enabled by default:
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
```

Access policies enforce tenancy checks:
```sql
CREATE POLICY "Tenant Isolation Policy" ON <table_name>
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );
```
