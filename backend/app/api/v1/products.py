import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from supabase import Client

from app.core.dependencies import AuthenticatedUser, get_current_user, get_user_supabase_client
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.services.fallback_store import (
    is_remote_store_unreachable,
    mem_create_product,
    mem_get_product,
    mem_list_products,
    mem_sync_product,
    mem_update_product,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Uploads a product image, saves it to backend/static/product_images/,
    and returns {"image_url": "http://127.0.0.1:8000/static/product_images/<filename>"}.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided with image upload.",
        )

    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image file format '{ext}'. Allowed: {', '.join(allowed_exts)}",
        )

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    static_images_dir = Path(__file__).resolve().parent.parent.parent.parent / "static" / "product_images"
    static_images_dir.mkdir(parents=True, exist_ok=True)
    target_path = static_images_dir / unique_filename

    contents = await file.read()
    with open(target_path, "wb") as f:
        f.write(contents)

    image_url = f"http://127.0.0.1:8000/static/product_images/{unique_filename}"
    return {"image_url": image_url, "filename": unique_filename}


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> ProductResponse:
    """
    Creates a new product item for a business.
    Validates stock quantity and logs initial inventory movement if stock > 0.
    """
    if payload.stock_qty < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Initial stock quantity cannot be negative.",
        )

    try:
        # Check if SKU already exists
        sku_check = (
            supabase_client.table("products")
            .select("id")
            .eq("business_id", payload.business_id)
            .eq("sku", payload.sku)
            .execute()
        )
        if sku_check.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with SKU '{payload.sku}' already exists in this business.",
            )

        # Insert product
        product_dict = {
            "business_id": payload.business_id,
            "sku": payload.sku,
            "name": payload.name,
            "category": payload.category,
            "unit": payload.unit,
            "cost_price": payload.cost_price,
            "selling_price": payload.selling_price,
            "stock_qty": payload.stock_qty,
            "low_stock_threshold": payload.low_stock_threshold,
        }

        # Try inserting with image_url, gracefully fallback without it if column doesn't exist
        if payload.image_url:
            try:
                res = supabase_client.table("products").insert({**product_dict, "image_url": payload.image_url}).execute()
            except Exception:
                res = supabase_client.table("products").insert(product_dict).execute()
        else:
            res = supabase_client.table("products").insert(product_dict).execute()

        if res.data:
            new_product = res.data[0]
            product_id = new_product["id"]
            if payload.image_url and "image_url" not in new_product:
                new_product["image_url"] = payload.image_url
            mem_sync_product(new_product)

            if payload.stock_qty > 0:
                try:
                    supabase_client.table("inventory_movements").insert({
                        "business_id": payload.business_id,
                        "product_id": product_id,
                        "movement_type": "restock",
                        "quantity_delta": payload.stock_qty,
                        "reference_type": "initial_stock",
                        "notes": "Initial inventory intake upon product creation",
                        "created_by": current_user.id,
                    }).execute()
                except Exception:
                    pass

            return ProductResponse(
                id=new_product["id"],
                business_id=new_product["business_id"],
                sku=new_product["sku"],
                name=new_product["name"],
                category=new_product.get("category"),
                unit=new_product["unit"],
                cost_price=float(new_product["cost_price"]),
                selling_price=float(new_product["selling_price"]),
                stock_qty=int(new_product["stock_qty"]),
                low_stock_threshold=int(new_product["low_stock_threshold"]),
                image_url=new_product.get("image_url") or payload.image_url,
                created_at=str(new_product.get("created_at")),
                updated_at=str(new_product.get("updated_at")),
            )

    except HTTPException:
        raise
    except Exception as e:
        if is_remote_store_unreachable(e):
            logger.info("Supabase table 'products' unavailable. Using fallback store.")
            prod = mem_create_product(payload.model_dump())
            return ProductResponse(**prod)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create product: {str(e)}",
        )

    # Fallback store
    prod = mem_create_product(payload.model_dump())
    return ProductResponse(**prod)


@router.patch("/{product_id}", response_model=ProductResponse)
@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdate,
    x_business_id: Optional[str] = Header(None, alias="X-Business-Id"),
    business_id: Optional[str] = Query(None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> ProductResponse:
    """
    Updates an existing product item for a business.
    Accepts X-Business-Id header or business_id query parameter.
    Persists changes to Supabase and fallback disk store.
    """
    target_biz_id = x_business_id or business_id

    # Build update dictionary
    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name
    if payload.sku is not None:
        update_data["sku"] = payload.sku
    if payload.category is not None:
        update_data["category"] = payload.category
    if payload.unit is not None:
        update_data["unit"] = payload.unit
    if payload.cost_price is not None:
        update_data["cost_price"] = payload.cost_price
    if payload.selling_price is not None:
        update_data["selling_price"] = payload.selling_price

    # Support either stock_qty or stock_quantity
    stock_val = payload.stock_qty if payload.stock_qty is not None else payload.stock_quantity
    if stock_val is not None:
        update_data["stock_qty"] = stock_val

    if payload.low_stock_threshold is not None:
        update_data["low_stock_threshold"] = payload.low_stock_threshold
    if "image_url" in payload.model_fields_set:
        update_data["image_url"] = payload.image_url

    if not update_data:
        existing = mem_get_product(product_id)
        if existing:
            return ProductResponse(**existing)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update.")

    # 1. Try Supabase update
    try:
        query = supabase_client.table("products").update(update_data).eq("id", product_id)
        if target_biz_id:
            query = query.eq("business_id", target_biz_id)
        res = query.execute()

        if res.data:
            updated_p = res.data[0]
            merged = {**updated_p, **update_data}
            mem_sync_product(merged)
            return ProductResponse(
                id=merged["id"],
                business_id=merged["business_id"],
                sku=merged["sku"],
                name=merged["name"],
                category=merged.get("category"),
                unit=merged["unit"],
                cost_price=float(merged["cost_price"]),
                selling_price=float(merged["selling_price"]),
                stock_qty=int(merged["stock_qty"]),
                low_stock_threshold=int(merged["low_stock_threshold"]),
                image_url=merged.get("image_url"),
                created_at=str(merged.get("created_at")),
                updated_at=str(merged.get("updated_at")),
            )
    except Exception as e:
        # Retry without image_url if remote table doesn't have the column
        if "image_url" in update_data:
            try:
                data_no_img = {k: v for k, v in update_data.items() if k != "image_url"}
                query = supabase_client.table("products").update(data_no_img).eq("id", product_id)
                if target_biz_id:
                    query = query.eq("business_id", target_biz_id)
                res = query.execute()
                if res.data:
                    updated_p = res.data[0]
                    merged = {**updated_p, **update_data}
                    mem_sync_product(merged)
                    return ProductResponse(
                        id=merged["id"],
                        business_id=merged["business_id"],
                        sku=merged["sku"],
                        name=merged["name"],
                        category=merged.get("category"),
                        unit=merged["unit"],
                        cost_price=float(merged["cost_price"]),
                        selling_price=float(merged["selling_price"]),
                        stock_qty=int(merged["stock_qty"]),
                        low_stock_threshold=int(merged["low_stock_threshold"]),
                        image_url=merged.get("image_url"),
                        created_at=str(merged.get("created_at")),
                        updated_at=str(merged.get("updated_at")),
                    )
            except Exception:
                pass
        if not is_remote_store_unreachable(e):
            logger.info(f"Supabase update failed ({e}). Falling back to local store.")

    # 2. Fallback store update
    updated_mem = mem_update_product(product_id, update_data)
    if updated_mem:
        if target_biz_id and updated_mem["business_id"] != target_biz_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID '{product_id}' not found in business '{target_biz_id}'.",
            )
        return ProductResponse(**updated_mem)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Product with ID '{product_id}' not found.",
    )


@router.get("", response_model=List[ProductResponse])
async def list_products(
    business_id: str = Query(..., description="UUID of the business to filter products"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> List[ProductResponse]:
    """
    Lists all inventory products for the specified business.
    Protected by PostgreSQL RLS.
    """
    try:
        res = (
            supabase_client.table("products")
            .select("*")
            .eq("business_id", business_id)
            .order("name")
            .execute()
        )
        if res.data:
            return [
                ProductResponse(
                    id=item["id"],
                    business_id=item["business_id"],
                    sku=item["sku"],
                    name=item["name"],
                    category=item.get("category"),
                    unit=item["unit"],
                    cost_price=float(item["cost_price"]),
                    selling_price=float(item["selling_price"]),
                    stock_qty=int(item["stock_qty"]),
                    low_stock_threshold=int(item["low_stock_threshold"]),
                    image_url=item.get("image_url"),
                    created_at=str(item.get("created_at")),
                    updated_at=str(item.get("updated_at")),
                )
                for item in res.data
            ]
    except Exception as e:
        if not is_remote_store_unreachable(e):
            logger.warning(f"Error listing products via PostgREST: {e}")

    # Fallback store results
    mem_prods = mem_list_products(business_id)
    return [ProductResponse(**p) for p in mem_prods]
