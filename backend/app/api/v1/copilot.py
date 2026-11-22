"""
AI Copilot Endpoints for OjaPilot.
Provides intelligent natural-language sales and inventory parsing with seamless
deterministic fallback when external LLM APIs are unreachable or unconfigured.
"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.config import settings
from app.core.dependencies import AuthenticatedUser, get_current_user, get_user_supabase_client
from app.schemas.copilot import CopilotParseRequest, CopilotParseResponse
from app.services.fallback_store import is_remote_store_unreachable, mem_list_products
from app.ai.copilot import parse_sale_with_copilot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["AI Copilot"])


@router.post("/parse-sale", response_model=CopilotParseResponse, status_code=status.HTTP_200_OK)
async def parse_sale_note_endpoint(
    payload: CopilotParseRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> CopilotParseResponse:
    """
    Parses a natural-language sales or stock note (e.g., 'Sold 2 Peak milk', '3 bread and 1 coke').
    1. Fetches current product catalog for the business.
    2. Matches items, computes quantities, discounts, and line totals.
    3. Employs Gemini LLM reasoning when available; falls back deterministically so it never fails.
    4. Generates an idempotent SaleCreate payload ready for human-in-the-loop confirmation.
    """
    products: List[dict] = []

    # 1. Fetch current catalog for active business
    try:
        prod_res = (
            supabase_client.table("products")
            .select("*")
            .eq("business_id", payload.business_id)
            .execute()
        )
        if prod_res.data:
            products = prod_res.data
    except Exception as e:
        if not is_remote_store_unreachable(e):
            logger.warning(f"Error fetching products via PostgREST: {e}")

    # Fallback to in-memory store if PostgREST was unreachable or returned empty
    if not products:
        products = mem_list_products(payload.business_id)

    # 2. Parse using AI Copilot Engine
    gemini_key = settings.GEMINI_API_KEY if settings.GEMINI_API_KEY else None
    result = parse_sale_with_copilot(
        note=payload.note,
        products=products,
        business_id=payload.business_id,
        gemini_api_key=gemini_key,
    )

    # 3. Best-effort logging to ai_action_proposals if remote table exists
    try:
        proposal_record = {
            "id": result.proposal_id,
            "business_id": payload.business_id,
            "source_prompt": payload.note,
            "intent_type": "record_sale",
            "summary": result.summary,
            "proposed_payload": result.suggested_payload.model_dump() if result.suggested_payload else {},
            "status": "pending",
            "idempotency_key": result.suggested_payload.idempotency_key if result.suggested_payload else None,
            "created_by": current_user.id,
        }
        supabase_client.table("ai_action_proposals").insert(proposal_record).execute()
    except Exception:
        # Action proposal logging is non-blocking for high availability
        pass

    return result
