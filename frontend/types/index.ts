export type UserRole = "owner" | "admin" | "manager" | "staff";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface Product {
  id: string;
  organization_id: string;
  sku: string;
  title: string;
  category?: string;
  unit: string;
  unit_cost: number;
  unit_price: number;
}

export interface InventoryItem {
  id: string;
  organization_id: string;
  product_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_threshold: number;
  optimal_stock_level: number;
  location: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed";

export interface AIProposal {
  id: string;
  organization_id: string;
  action_type: "RESTOCK_PURCHASE" | "PRICE_ADJUSTMENT" | "TRANSFER" | "STOCK_WRITE_OFF";
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  status: ProposalStatus;
  created_at: string;
}
