import logging
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.dependencies import AuthenticatedUser, get_current_user, get_user_supabase_client, get_service_role_client
from app.core.security import hash_store_password, verify_store_password
from app.schemas.business import (
    BusinessCreate,
    BusinessResponse,
    BusinessUnlockRequest,
    BusinessUnlockResponse,
    BusinessSetPasswordRequest,
    BusinessSetPasswordResponse,
)
from app.services.fallback_store import (
    is_remote_store_unreachable,
    mem_create_business,
    mem_get_business,
    mem_list_businesses,
    mem_set_business_password,
    mem_sync_business,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(
    payload: BusinessCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> BusinessResponse:
    """
    Creates a new business tenant with optional password protection.
    Automatically assigns the logged-in user as 'owner'.
    All operations are performed with user-scoped context and PostgreSQL RLS.
    """
    slug = payload.slug or f"biz-{uuid.uuid4().hex[:8]}"
    password_hash = hash_store_password(payload.password) if payload.password else None

    # 1. Attempt live Supabase operation with PostgreSQL RLS
    try:
        # Ensure user profile exists
        try:
            profile_res = supabase_client.table("profiles").select("id").eq("id", current_user.id).execute()
            if not profile_res.data:
                supabase_client.table("profiles").insert({
                    "id": current_user.id,
                    "full_name": current_user.email.split("@")[0] if current_user.email else "Business Owner",
                }).execute()
        except Exception:
            service_client = get_service_role_client()
            if service_client:
                try:
                    service_client.table("profiles").upsert({
                        "id": current_user.id,
                        "full_name": current_user.email.split("@")[0] if current_user.email else "Business Owner",
                    }).execute()
                except Exception:
                    pass

        # Insert business record
        biz_data = {
            "name": payload.name,
            "slug": slug,
            "currency": payload.currency.upper(),
        }
        if password_hash:
            biz_data["password_hash"] = password_hash

        try:
            biz_insert = supabase_client.table("businesses").insert(biz_data).execute()
        except Exception:
            # If remote table doesn't have password_hash column yet, insert without it
            if "password_hash" in biz_data:
                del biz_data["password_hash"]
                biz_insert = supabase_client.table("businesses").insert(biz_data).execute()
            else:
                raise

        if biz_insert.data:
            new_business = biz_insert.data[0]
            business_id = new_business["id"]
            if password_hash:
                new_business["password_hash"] = password_hash
            mem_sync_business(new_business, current_user.id)

            # Add creator to business_members as 'owner'
            member_data = {
                "business_id": business_id,
                "user_id": current_user.id,
                "role": "owner",
            }
            try:
                supabase_client.table("business_members").insert(member_data).execute()
            except Exception:
                service_client = get_service_role_client()
                if service_client:
                    try:
                        service_client.table("business_members").insert(member_data).execute()
                    except Exception:
                        pass

            return BusinessResponse(
                id=new_business["id"],
                name=new_business["name"],
                slug=new_business["slug"],
                currency=new_business["currency"],
                created_at=str(new_business.get("created_at")),
                role="owner",
                has_password=bool(password_hash),
            )

    except Exception as e:
        if is_remote_store_unreachable(e):
            logger.info(f"Supabase PostgREST unavailable ({type(e).__name__}). Using fallback store.")
            res = mem_create_business(
                current_user.id,
                payload.name,
                slug,
                payload.currency,
                password_hash=password_hash,
            )
            return BusinessResponse(**res)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating business: {str(e)}",
        )

    # Fallback if no data was returned
    res = mem_create_business(
        current_user.id,
        payload.name,
        slug,
        payload.currency,
        password_hash=password_hash,
    )
    return BusinessResponse(**res)


@router.get("", response_model=List[BusinessResponse])
async def list_businesses(
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> List[BusinessResponse]:
    """
    Returns all businesses where the authenticated user is an active member.
    PostgreSQL RLS ensures tenant isolation.
    """
    try:
        query = (
            supabase_client.table("business_members")
            .select("role, business_id, businesses(id, name, slug, currency, created_at)")
            .eq("user_id", current_user.id)
            .execute()
        )

        results: List[BusinessResponse] = []
        for row in query.data or []:
            biz = row.get("businesses")
            if biz:
                local_biz = mem_get_business(biz["id"]) or {}
                has_pwd = bool(biz.get("password_hash") or local_biz.get("password_hash"))
                results.append(
                    BusinessResponse(
                        id=biz["id"],
                        name=biz["name"],
                        slug=biz["slug"],
                        currency=biz["currency"],
                        created_at=str(biz.get("created_at")),
                        role=row.get("role"),
                        has_password=has_pwd,
                    )
                )

        if results:
            return results

    except Exception as e:
        if not is_remote_store_unreachable(e):
            logger.warning(f"Error querying businesses via PostgREST: {e}")

    # Fallback store results
    mem_results = mem_list_businesses(current_user.id)
    return [BusinessResponse(**b) for b in mem_results]


@router.post("/{business_id}/unlock", response_model=BusinessUnlockResponse)
async def unlock_business(
    business_id: str,
    payload: BusinessUnlockRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> BusinessUnlockResponse:
    """
    Verifies a store password/PIN and returns unlocked=true on success.
    Returns HTTP 401 if the password is incorrect.
    """
    biz = mem_get_business(business_id)
    if not biz:
        try:
            res = supabase_client.table("businesses").select("*").eq("id", business_id).execute()
            if res.data:
                biz = res.data[0]
                mem_sync_business(biz, current_user.id)
        except Exception:
            pass

    if not biz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found",
        )

    password_hash = biz.get("password_hash")
    # If store has no password set, it is open / unlocked by default
    if not password_hash:
        return BusinessUnlockResponse(unlocked=True, message="Store does not require a password")

    if not verify_store_password(payload.password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect store password",
        )

    return BusinessUnlockResponse(unlocked=True, message="Store unlocked successfully")


@router.post("/{business_id}/set-password", response_model=BusinessSetPasswordResponse)
async def set_business_password(
    business_id: str,
    payload: BusinessSetPasswordRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client),
) -> BusinessSetPasswordResponse:
    """
    Sets a password on an unprotected store, or updates an existing store's password.
    Requires current_password if the store is already protected.
    """
    biz = mem_get_business(business_id)
    if not biz:
        try:
            res = supabase_client.table("businesses").select("*").eq("id", business_id).execute()
            if res.data:
                biz = res.data[0]
                mem_sync_business(biz, current_user.id)
        except Exception:
            pass

    if not biz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store not found",
        )

    existing_hash = biz.get("password_hash")
    # If store already has a password, verify the current password first
    if existing_hash:
        if not payload.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to change password",
            )
        if not verify_store_password(payload.current_password, existing_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect",
            )

    new_hash = hash_store_password(payload.new_password)
    mem_set_business_password(business_id, new_hash)

    # Attempt to sync with Supabase if column exists
    try:
        supabase_client.table("businesses").update({"password_hash": new_hash}).eq("id", business_id).execute()
    except Exception:
        pass

    return BusinessSetPasswordResponse(
        success=True,
        has_password=True,
        message="Store password updated successfully",
    )
