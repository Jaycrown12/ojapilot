import re
from typing import Optional
from pydantic import BaseModel, Field, model_validator


def generate_slug(name: str) -> str:
    """Generate a clean URL-friendly slug from a business name."""
    clean = re.sub(r"[^\w\s-]", "", name).strip().lower()
    return re.sub(r"[-\s]+", "-", clean)


class BusinessCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Business name")
    slug: Optional[str] = Field(None, max_length=100, description="Unique slug for the business")
    currency: str = Field("NGN", max_length=10, description="Base currency code (default: NGN)")
    password: Optional[str] = Field(None, description="Optional or required password/PIN for store access")

    @model_validator(mode="before")
    @classmethod
    def set_slug(cls, data):
        if isinstance(data, dict):
            if not data.get("slug") and data.get("name"):
                data["slug"] = generate_slug(data["name"])
        return data


class BusinessResponse(BaseModel):
    id: str
    name: str
    slug: str
    currency: str
    created_at: Optional[str] = None
    role: Optional[str] = None
    has_password: bool = False


class BusinessMemberResponse(BaseModel):
    id: str
    business_id: str
    user_id: str
    role: str
    created_at: Optional[str] = None


class BusinessUnlockRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Store access password or PIN")


class BusinessUnlockResponse(BaseModel):
    unlocked: bool = True
    message: Optional[str] = "Store unlocked successfully"


class BusinessSetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=1, description="New store password or PIN")
    current_password: Optional[str] = Field(None, description="Current password (required if store already has a password)")


class BusinessSetPasswordResponse(BaseModel):
    success: bool = True
    has_password: bool = True
    message: str = "Store password updated successfully"
