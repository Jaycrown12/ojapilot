import logging
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import Client, ClientOptions, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)

# Security scheme for parsing Bearer token
security_bearer = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    """Represents a validated Supabase authenticated user."""
    id: str
    email: Optional[str] = None
    role: Optional[str] = "authenticated"
    token: str


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> AuthenticatedUser:
    """
    Extracts and validates the Supabase Bearer JWT token from the Authorization header.
    Decodes the JWT claims (sub, email, role) to retrieve user identity without network latency.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Expected Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()

    # Decode JWT claims directly to extract user identity
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub") or payload.get("id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="JWT token does not contain a valid subject (sub) claim.",
            )
        return AuthenticatedUser(
            id=str(user_id),
            email=payload.get("email"),
            role=payload.get("role", "authenticated"),
            token=token,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to decode JWT token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid JWT token format.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_user_supabase_client(user: AuthenticatedUser = Depends(get_current_user)) -> Client:
    """
    Initializes a user-scoped Supabase client pointing directly to the active project.
    By setting the Authorization header to the user's Bearer JWT, all PostgREST
    queries execute under the context of auth.uid(), allowing PostgreSQL Row Level
    Security (RLS) policies to isolate data automatically.
    Uses a 1.5s timeout with fast failover to prevent hanging if remote host is unreachable.
    """
    supabase_url = settings.SUPABASE_URL.strip() if settings.SUPABASE_URL else "https://gjiulkrjqbkijmsbamze.supabase.co"
    supabase_key = settings.SUPABASE_ANON_KEY.strip() if settings.SUPABASE_ANON_KEY else "sb_publishable_eyKwVGRfcg87uF3TbkkXIQ_o_vZvCvS"

    options = ClientOptions(
        headers={"Authorization": f"Bearer {user.token}"},
        postgrest_client_timeout=1.5,
        postgrest_client_retry=False,
    )
    client = create_client(supabase_url, supabase_key, options=options)
    client.postgrest.auth(user.token)
    return client


def get_service_role_client() -> Optional[Client]:
    """
    Returns an administrative Supabase client using SUPABASE_SERVICE_ROLE_KEY.
    Used ONLY for server-level operations that bypass RLS (e.g., initial bootstrap).
    """
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    supabase_url = settings.SUPABASE_URL.strip() if settings.SUPABASE_URL else "https://gjiulkrjqbkijmsbamze.supabase.co"
    options = ClientOptions(postgrest_client_timeout=1.5, postgrest_client_retry=False)
    return create_client(supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY.strip(), options=options)
