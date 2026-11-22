from typing import List, Optional
from pydantic import BaseModel, Field


class SaleItemCreate(BaseModel):
    product_id: str = Field(..., description="UUID of the product being purchased")
    quantity: int = Field(..., gt=0, description="Quantity being purchased (must be > 0)")
    unit_price: Optional[float] = Field(None, ge=0.0, description="Override unit price; defaults to product selling price")


class SaleCreate(BaseModel):
    business_id: str = Field(..., description="UUID of the business")
    customer_id: Optional[str] = Field(None, description="Optional UUID of customer")
    customer_name: Optional[str] = Field(None, description="Optional name of the customer buying or owing")
    idempotency_key: str = Field(..., description="Unique client-generated UUID for idempotency")
    items: List[SaleItemCreate] = Field(..., min_length=1, description="List of items sold")
    discount: float = Field(0.0, ge=0.0, description="Total discount applied to the sale")
    amount_paid: Optional[float] = Field(None, ge=0.0, description="Amount paid immediately by customer")
    balance_due: Optional[float] = Field(None, ge=0.0, description="Remaining balance owed on credit")
    payment_status: Optional[str] = Field(None, description="Payment status: paid, partial, or credit")


class SaleItemResponse(BaseModel):
    id: str
    sale_id: str
    product_id: str
    product_name: Optional[str] = None
    quantity: int
    unit_price: float
    line_total: float


class SaleResponse(BaseModel):
    id: str
    business_id: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    idempotency_key: Optional[str] = None
    status: str
    payment_status: Optional[str] = "paid"
    subtotal: float
    discount: float
    total_amount: float
    amount_paid: float
    balance_due: float
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    items: List[SaleItemResponse] = []
