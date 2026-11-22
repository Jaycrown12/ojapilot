from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.sale import SaleCreate


class CopilotParseRequest(BaseModel):
    business_id: str = Field(..., description="UUID of the active business workspace")
    note: str = Field(..., min_length=1, max_length=1000, description="Natural language note typed or spoken by user")


class ParsedItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    unit_price: float
    line_total: float
    available_stock: int
    matched_text: str


class CopilotParseResponse(BaseModel):
    proposal_id: str
    business_id: str
    note: str
    summary: str
    customer_name: Optional[str] = None
    items: List[ParsedItem]
    subtotal: float
    discount: float
    total_amount: float
    amount_paid: float
    balance_due: float
    payment_status: str = "paid"  # "paid", "partial", "credit"
    unmatched_tokens: List[str] = []
    explanation: str
    source: str = "deterministic_engine"  # "llm" or "deterministic_engine"
    suggested_payload: Optional[SaleCreate] = None
