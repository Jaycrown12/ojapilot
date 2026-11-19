-- ==============================================================================
-- OJAPILOT Base PostgreSQL Schema
-- Compatible with Supabase PostgreSQL (Auth + RLS)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Organizations (Tenants)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. User Profiles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Organization Memberships (RBAC & Multi-tenant Mapping)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 4. Products Catalog
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'piece',
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, sku)
);

-- ------------------------------------------------------------------------------
-- 5. Inventory Items & Reorder Thresholds
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    reorder_threshold INT NOT NULL DEFAULT 10,
    optimal_stock_level INT NOT NULL DEFAULT 50,
    location VARCHAR(100) DEFAULT 'Main Warehouse',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, product_id, location)
);

-- ------------------------------------------------------------------------------
-- 6. Stock Movement Transactions (Audit Ledger)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('PURCHASE_RECEIPT', 'SALE_DEDUCTION', 'MANUAL_ADJUSTMENT', 'RETURN', 'DAMAGED')),
    quantity_change INT NOT NULL,
    reference_id VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. Sales Orders & Line Items
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'pending', 'completed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, order_number)
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL
);

-- ------------------------------------------------------------------------------
-- 8. AI Action Proposals (Human-in-the-Loop)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL CHECK (action_type IN ('RESTOCK_PURCHASE', 'PRICE_ADJUSTMENT', 'TRANSFER', 'STOCK_WRITE_OFF')),
    title VARCHAR(255) NOT NULL,
    rationale TEXT NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
    proposed_by VARCHAR(50) DEFAULT 'copilot-agent',
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. Row Level Security (RLS) Enablement
-- ------------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_proposals ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 10. Sample RLS Policy for Multi-Tenant Isolation
-- ------------------------------------------------------------------------------
CREATE POLICY "Tenant Members Can View Products" ON products
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Tenant Members Can View Inventory" ON inventory_items
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Tenant Members Can View Proposals" ON ai_proposals
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );
