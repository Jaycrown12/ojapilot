"""
Store security utilities: password hashing and verification using hashlib.pbkdf2_hmac.
"""
import hashlib
import hmac
import os
from typing import Optional


def hash_store_password(password: str) -> str:
    """
    Hashes a store password or PIN using PBKDF2-HMAC-SHA256 with a random salt.
    Format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
    """
    if not password:
        raise ValueError("Password cannot be empty")
    salt = os.urandom(16).hex()
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${derived}"


def verify_store_password(password: str, password_hash: Optional[str]) -> bool:
    """
    Verifies a plain password or PIN against the stored PBKDF2 hash.
    Uses constant-time comparison via hmac.compare_digest.
    """
    if not password or not password_hash:
        return False
    try:
        parts = password_hash.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected_hex = parts[3]
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        ).hex()
        return hmac.compare_digest(derived, expected_hex)
    except Exception:
        return False
