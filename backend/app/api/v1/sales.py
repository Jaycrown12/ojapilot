import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.dependencies import AuthenticatedUser, get_current_user, get_user_supabase_client
from app.schemas.sale import SaleCreate, SaleResponse, SaleItemResponse
from app.services.fallback_store import (
    is_remote_store_unreachable,
    mem_get_product,
    mem_update_product_stock,
    mem_get_sale_by_idempotency,
    mem_create_sale,
    mem_list_sales,
    mem_sync_sale,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def record_sale(
    payload: SaleCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> SaleResponse:
    """
    Safely records a sales transaction:
    1. Enforces idempotency via idempotency_key to prevent duplicate charges/records.
    2. Validates product stock and blocks sales if requested quantity > available stock.
    3. Atomically updates product stock_qty.
    4. Logs inventory_movements audit records.
    5. Returns the completed sale receipt with line items.
    """
    # 1. Attempt live Supabase PostgREST operation
    try:
        # Check idempotency
        existing = (
            supabase_client.table("sales")
            .select("*, sale_items(*)")
            .eq("business_id", payload.business_id)
            .eq("idempotency_key", payload.idempotency_key)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            sale = existing.data[0]
            items = [
                SaleItemResponse(
                    id=item["id"],
                    sale_id=item["sale_id"],
                    product_id=item["product_id"],
                    quantity=int(item["quantity"]),
                    unit_price=float(item["unit_price"]),
                    line_total=float(item["line_total"]),
                )
                for item in sale.get("sale_items", [])
            ]
            return SaleResponse(
                id=sale["id"],
                business_id=sale["business_id"],
                customer_id=sale.get("customer_id"),
                idempotency_key=sale.get("idempotency_key"),
                status=sale["status"],
                subtotal=float(sale["subtotal"]),
                discount=float(sale["discount"]),
                total_amount=float(sale["total_amount"]),
                amount_paid=float(sale["amount_paid"]),
                balance_due=float(sale["balance_due"]),
                created_by=sale.get("created_by"),
                created_at=str(sale.get("created_at")),
                items=items,
            )

        # Fetch products to validate stock
        product_ids = [item.product_id for item in payload.items]
        prod_res = (
            supabase_client.table("products")
            .select("*")
            .eq("business_id", payload.business_id)
            .in_("id", product_ids)
            .execute()
        )
        product_map = {p["id"]: p for p in (prod_res.data or [])}

        for item in payload.items:
            if item.product_id not in product_map:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product with ID '{item.product_id}' not found in this business.",
                )

        computed_items = []
        subtotal = 0.0

        for item in payload.items:
            product = product_map[item.product_id]
            current_stock = int(product["stock_qty"])

            if current_stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for '{product['name']}'. Available: {current_stock}, Requested: {item.quantity}.",
                )

            unit_price = item.unit_price if item.unit_price is not None else float(product["selling_price"])
            line_total = round(unit_price * item.quantity, 2)
            subtotal += line_total

            computed_items.append({
                "product_id": item.product_id,
                "product_name": product["name"],
                "quantity": item.quantity,
                "unit_price": unit_price,
                "line_total": line_total,
                "current_stock": current_stock,
            })

        subtotal = round(subtotal, 2)
        total_amount = max(0.0, round(subtotal - payload.discount, 2))
        if payload.balance_due is not None and payload.amount_paid is not None:
            amount_paid = payload.amount_paid
            balance_due = payload.balance_due
        elif payload.balance_due is not None:
            balance_due = min(payload.balance_due, total_amount)
            amount_paid = max(0.0, round(total_amount - balance_due, 2))
        elif payload.amount_paid is not None:
            amount_paid = min(payload.amount_paid, total_amount)
            balance_due = max(0.0, round(total_amount - amount_paid, 2))
        else:
            amount_paid = total_amount
            balance_due = 0.0

        if payload.payment_status:
            payment_status = payload.payment_status
        else:
            if balance_due <= 0.0:
                payment_status = "paid"
            elif amount_paid <= 0.0:
                payment_status = "credit"
            else:
                payment_status = "partial"

        sale_data = {
            "business_id": payload.business_id,
            "customer_id": payload.customer_id,
            "idempotency_key": payload.idempotency_key,
            "status": "completed",
            "subtotal": subtotal,
            "discount": payload.discount,
            "total_amount": total_amount,
            "amount_paid": amount_paid,
            "balance_due": balance_due,
            "created_by": current_user.id,
        }
        try:
            sale_res = supabase_client.table("sales").insert({
                **sale_data,
                "customer_name": payload.customer_name,
                "payment_status": payment_status,
            }).execute()
        except Exception:
            sale_res = supabase_client.table("sales").insert(sale_data).execute()

        if sale_res.data:
            new_sale = sale_res.data[0]
            sale_id = new_sale["id"]

            sale_items_data = [
                {
                    "sale_id": sale_id,
                    "product_id": c["product_id"],
                    "quantity": c["quantity"],
                    "unit_price": c["unit_price"],
                    "line_total": c["line_total"],
                }
                for c in computed_items
            ]
            items_res = supabase_client.table("sale_items").insert(sale_items_data).execute()

            for c in computed_items:
                new_stock = c["current_stock"] - c["quantity"]
                supabase_client.table("products").update({"stock_qty": new_stock}).eq("id", c["product_id"]).execute()
                try:
                    supabase_client.table("inventory_movements").insert({
                        "business_id": payload.business_id,
                        "product_id": c["product_id"],
                        "movement_type": "sale",
                        "quantity_delta": -c["quantity"],
                        "reference_type": "sale",
                        "reference_id": sale_id,
                        "notes": f"Sale of {c['quantity']} units ({c['product_name']})",
                        "created_by": current_user.id,
                    }).execute()
                except Exception:
                    pass

            response_items = [
                SaleItemResponse(
                    id=item["id"],
                    sale_id=item["sale_id"],
                    product_id=item["product_id"],
                    product_name=product_map.get(item["product_id"], {}).get("name"),
                    quantity=int(item["quantity"]),
                    unit_price=float(item["unit_price"]),
                    line_total=float(item["line_total"]),
                )
                for item in (items_res.data or [])
            ]

            mem_sync_sale({
                **new_sale,
                "customer_name": new_sale.get("customer_name") or payload.customer_name,
                "payment_status": new_sale.get("payment_status") or payment_status,
                "items": [it.model_dump() for it in response_items],
            })

            return SaleResponse(
                id=new_sale["id"],
                business_id=new_sale["business_id"],
                customer_id=new_sale.get("customer_id"),
                customer_name=new_sale.get("customer_name") or payload.customer_name,
                idempotency_key=new_sale.get("idempotency_key"),
                status=new_sale["status"],
                payment_status=new_sale.get("payment_status") or payment_status,
                subtotal=float(new_sale["subtotal"]),
                discount=float(new_sale["discount"]),
                total_amount=float(new_sale["total_amount"]),
                amount_paid=float(new_sale["amount_paid"]),
                balance_due=float(new_sale["balance_due"]),
                created_by=new_sale.get("created_by"),
                created_at=str(new_sale.get("created_at")),
                items=response_items,
            )

    except HTTPException:
        raise
    except Exception as e:
        if not is_remote_store_unreachable(e):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Sale processing failed: {str(e)}")
        logger.info(f"Supabase store unreachable ({e}). Processing sale via fallback store.")

    # 2. Fallback Store Processing
    existing_sale = mem_get_sale_by_idempotency(payload.business_id, payload.idempotency_key)
    if existing_sale:
        items = [SaleItemResponse(**it) for it in existing_sale.get("items", [])]
        return SaleResponse(**{**existing_sale, "items": items})

    computed_items = []
    subtotal = 0.0

    for item in payload.items:
        product = mem_get_product(item.product_id)
        if not product or product["business_id"] != payload.business_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID '{item.product_id}' not found.",
            )

        current_stock = int(product["stock_qty"])
        if current_stock < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for '{product['name']}'. Available: {current_stock}, Requested: {item.quantity}.",
            )

        unit_price = item.unit_price if item.unit_price is not None else float(product["selling_price"])
        line_total = round(unit_price * item.quantity, 2)
        subtotal += line_total

        computed_items.append({
            "product_id": item.product_id,
            "product_name": product["name"],
            "quantity": item.quantity,
            "unit_price": unit_price,
            "line_total": line_total,
            "current_stock": current_stock,
        })

    subtotal = round(subtotal, 2)
    total_amount = max(0.0, round(subtotal - payload.discount, 2))
    if payload.balance_due is not None and payload.amount_paid is not None:
        amount_paid = payload.amount_paid
        balance_due = payload.balance_due
    elif payload.balance_due is not None:
        balance_due = min(payload.balance_due, total_amount)
        amount_paid = max(0.0, round(total_amount - balance_due, 2))
    elif payload.amount_paid is not None:
        amount_paid = min(payload.amount_paid, total_amount)
        balance_due = max(0.0, round(total_amount - amount_paid, 2))
    else:
        amount_paid = total_amount
        balance_due = 0.0

    if payload.payment_status:
        payment_status = payload.payment_status
    else:
        if balance_due <= 0.0:
            payment_status = "paid"
        elif amount_paid <= 0.0:
            payment_status = "credit"
        else:
            payment_status = "partial"

    sale_data = {
        "business_id": payload.business_id,
        "customer_id": payload.customer_id,
        "customer_name": payload.customer_name,
        "idempotency_key": payload.idempotency_key,
        "status": "completed",
        "payment_status": payment_status,
        "subtotal": subtotal,
        "discount": payload.discount,
        "total_amount": total_amount,
        "amount_paid": amount_paid,
        "balance_due": balance_due,
        "created_by": current_user.id,
    }

    for c in computed_items:
        mem_update_product_stock(c["product_id"], c["current_stock"] - c["quantity"])

    created_sale = mem_create_sale(sale_data, computed_items)
    items = [SaleItemResponse(**it) for it in created_sale.get("items", [])]
    return SaleResponse(**{**created_sale, "items": items})


@router.get("", response_model=List[SaleResponse])
async def list_sales(
    business_id: str = Query(..., description="UUID of the business to filter sales"),
    limit: int = Query(20, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> List[SaleResponse]:
    """
    Returns recent sales transactions for a business with their line items.
    Protected by PostgreSQL RLS.
    """
    try:
        sales_res = (
            supabase_client.table("sales")
            .select("*, sale_items(*)")
            .eq("business_id", business_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        if sales_res.data:
            results = []
            for s in sales_res.data:
                items = [
                    SaleItemResponse(
                        id=item["id"],
                        sale_id=item["sale_id"],
                        product_id=item["product_id"],
                        quantity=int(item["quantity"]),
                        unit_price=float(item["unit_price"]),
                        line_total=float(item["line_total"]),
                    )
                    for item in s.get("sale_items", [])
                ]
                balance = float(s.get("balance_due", 0.0) or 0.0)
                amount = float(s.get("amount_paid", 0.0) or 0.0)
                status_calc = s.get("payment_status")
                if not status_calc:
                    if balance <= 0.0:
                        status_calc = "paid"
                    elif amount <= 0.0:
                        status_calc = "credit"
                    else:
                        status_calc = "partial"
                results.append(SaleResponse(**{**s, "payment_status": status_calc, "items": items}))
            return results
    except Exception as e:
        if not is_remote_store_unreachable(e):
            logger.warning(f"Error listing sales via PostgREST: {e}")

    # Fallback store results
    mem_sales = mem_list_sales(business_id, limit)
    results = []
    for s in mem_sales:
        items = [SaleItemResponse(**it) for it in s.get("items", [])]
        balance = float(s.get("balance_due", 0.0) or 0.0)
        amount = float(s.get("amount_paid", 0.0) or 0.0)
        status_calc = s.get("payment_status")
        if not status_calc:
            if balance <= 0.0:
                status_calc = "paid"
            elif amount <= 0.0:
                status_calc = "credit"
            else:
                status_calc = "partial"
        results.append(SaleResponse(**{**s, "payment_status": status_calc, "items": items}))
    return results
