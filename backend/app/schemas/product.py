from typing import Optional
from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    business_id: str = Field(..., description="Target business UUID")
    sku: str = Field(..., min_length=1, max_length=100, description="Product Stock Keeping Unit")
    name: str = Field(..., min_length=1, max_length=255, description="Product name")
    category: Optional[str] = Field(None, max_length=100, description="Category classification")
    unit: str = Field("piece", max_length=50, description="Unit of measurement")
    cost_price: float = Field(0.0, ge=0.0, description="Cost price per unit")
    selling_price: float = Field(..., ge=0.0, description="Retail/selling price per unit")
    stock_qty: int = Field(0, ge=0, description="Initial stock quantity on hand")
    low_stock_threshold: int = Field(5, ge=0, description="Alert threshold for low inventory")
    image_url: Optional[str] = Field(None, description="Product image URL or data URL")


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Product name")
    sku: Optional[str] = Field(None, min_length=1, max_length=100, description="Product Stock Keeping Unit")
    category: Optional[str] = Field(None, max_length=100, description="Category classification")
    unit: Optional[str] = Field(None, max_length=50, description="Unit of measurement")
    cost_price: Optional[float] = Field(None, ge=0.0, description="Cost price per unit")
    selling_price: Optional[float] = Field(None, ge=0.0, description="Retail/selling price per unit")
    stock_qty: Optional[int] = Field(None, ge=0, description="Stock quantity on hand")
    stock_quantity: Optional[int] = Field(None, ge=0, description="Alias for stock quantity")
    low_stock_threshold: Optional[int] = Field(None, ge=0, description="Alert threshold for low inventory")
    image_url: Optional[str] = Field(None, description="Product image URL or data URL")


class ProductResponse(BaseModel):
    id: str
    business_id: str
    sku: str
    name: str
    category: Optional[str] = None
    unit: str
    cost_price: float
    selling_price: float
    stock_qty: int
    low_stock_threshold: int
    image_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
