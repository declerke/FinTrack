from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.exceptions import HashVerificationError, UnknownHashError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.errors import ApiError
from app.models import Analyst

password_hasher = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)
TOKEN_LIFETIME = timedelta(hours=1)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except (HashVerificationError, UnknownHashError, ValueError):
        return False


def create_access_token(analyst_id: int) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": str(analyst_id),
        "iat": int(now.timestamp()),
        "exp": int((now + TOKEN_LIFETIME).timestamp()),
    }
    return jwt.encode(claims, get_settings().jwt_secret_key, algorithm="HS256")


def get_current_analyst(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Analyst:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "unauthorized", "A valid bearer token is required")
    try:
        claims = jwt.decode(
            credentials.credentials,
            get_settings().jwt_secret_key,
            algorithms=["HS256"],
            options={"require": ["sub", "exp"]},
        )
        subject = claims.get("sub")
        analyst_id = int(subject)
        if str(analyst_id) != subject or analyst_id < 1:
            raise ValueError("invalid subject")
    except (jwt.PyJWTError, TypeError, ValueError):
        raise ApiError(401, "unauthorized", "The bearer token is invalid or expired") from None

    analyst = session.get(Analyst, analyst_id)
    if analyst is None:
        raise ApiError(401, "unauthorized", "The bearer token is invalid or expired")
    return analyst
