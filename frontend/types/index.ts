export type UserRole = "owner" | "admin" | "manager" | "staff";

export interface Business {
  id: string;
  name: string;
  slug: string;
  currency: string;
  role?: UserRole;
  created_at?: string;
  has_password?: boolean;
}

export interface UnlockBusinessResponse {
  unlocked: boolean;
  message?: string;
}

export interface SetBusinessPasswordResponse {
  success: boolean;
  has_password: boolean;
  message: string;
}

export interface Product {
  id: string;
  business_id: string;
  sku: string;
  name: string;
  category?: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SaleItem {
  id?: string;
  sale_id?: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Sale {
  id: string;
  business_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  idempotency_key?: string;
  status: "draft" | "completed" | "cancelled";
  payment_status?: "paid" | "partial" | "credit" | string;
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  created_by?: string;
  created_at?: string;
  items?: SaleItem[];
}

export interface AIProposal {
  id: string;
  business_id: string;
  action_type: string;
  title: string;
  summary?: string;
  proposed_payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  created_at: string;
}

export interface ParsedItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  available_stock: number;
  matched_text: string;
}

export interface CopilotParseResponse {
  proposal_id: string;
  business_id: string;
  note: string;
  summary: string;
  customer_name?: string | null;
  items: ParsedItem[];
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_status?: "paid" | "partial" | "credit" | string;
  unmatched_tokens?: string[];
  explanation: string;
  source: "llm" | "deterministic_engine";
  suggested_payload?: {
    business_id: string;
    customer_id?: string | null;
    customer_name?: string | null;
    idempotency_key: string;
    items: Array<{
      product_id: string;
      quantity: number;
      unit_price?: number;
    }>;
    discount?: number;
    amount_paid?: number;
    balance_due?: number;
    payment_status?: string;
  };
}
