import { supabase } from "./supabase";
import { Business, Product, Sale, CopilotParseResponse } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

/**
 * Retrieves the active Supabase session access token.
 * Forwards the user's Bearer JWT to the FastAPI backend to enforce PostgreSQL RLS.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch (error) {
    console.warn("Could not retrieve active Supabase session token:", error);
  }
  return {};
}

/**
 * Generalized authenticated fetch wrapper for the OJAPILOT API.
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  
  const headers = {
    "Content-Type": "application/json",
    ...authHeader,
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorMessage = errorJson.detail;
      }
    } catch {
      // Non-JSON response
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// Businesses API
// -----------------------------------------------------------------------------

export async function getBusinesses(): Promise<Business[]> {
  return apiRequest<Business[]>("/businesses");
}

export async function createBusiness(data: {
  name: string;
  slug?: string;
  currency?: string;
  password?: string;
}): Promise<Business> {
  return apiRequest<Business>("/businesses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function unlockBusiness(
  businessId: string,
  password: string
): Promise<{ unlocked: boolean; message?: string }> {
  return apiRequest<{ unlocked: boolean; message?: string }>(
    `/businesses/${encodeURIComponent(businessId)}/unlock`,
    {
      method: "POST",
      body: JSON.stringify({ password }),
    }
  );
}

export async function setBusinessPassword(
  businessId: string,
  data: { new_password: string; current_password?: string }
): Promise<{ success: boolean; has_password: boolean; message: string }> {
  return apiRequest<{ success: boolean; has_password: boolean; message: string }>(
    `/businesses/${encodeURIComponent(businessId)}/set-password`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

// -----------------------------------------------------------------------------
// Products API
// -----------------------------------------------------------------------------

export async function getProducts(businessId: string): Promise<Product[]> {
  return apiRequest<Product[]>(`/products?business_id=${encodeURIComponent(businessId)}`);
}

export async function createProduct(data: {
  business_id: string;
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  cost_price: number;
  selling_price: number;
  stock_qty: number;
  low_stock_threshold?: number;
  image_url?: string | null;
}): Promise<Product> {
  return apiRequest<Product>("/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProduct(
  productId: string,
  data: {
    name?: string;
    sku?: string;
    category?: string;
    unit?: string;
    cost_price?: number;
    selling_price?: number;
    stock_qty?: number;
    stock_quantity?: number;
    low_stock_threshold?: number;
    image_url?: string | null;
  },
  businessId?: string
): Promise<Product> {
  const headers: Record<string, string> = {};
  if (businessId) {
    headers["X-Business-Id"] = businessId;
  }
  return apiRequest<Product>(`/products/${productId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
}

export async function uploadProductImage(file: File): Promise<{ image_url: string; filename?: string }> {
  const authHeader = await getAuthHeader();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/products/upload-image`, {
    method: "POST",
    headers: {
      ...authHeader,
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = `Upload error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) errorMessage = errorJson.detail;
    } catch {
      // non-JSON
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// Sales API
// -----------------------------------------------------------------------------

export async function getSales(businessId: string): Promise<Sale[]> {
  return apiRequest<Sale[]>(`/sales?business_id=${encodeURIComponent(businessId)}`);
}

export async function recordSale(data: {
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
}): Promise<Sale> {
  return apiRequest<Sale>("/sales", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// -----------------------------------------------------------------------------
// AI Copilot API
// -----------------------------------------------------------------------------

export async function parseSaleWithCopilot(data: {
  business_id: string;
  note: string;
}): Promise<CopilotParseResponse> {
  return apiRequest<CopilotParseResponse>("/copilot/parse-sale", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
