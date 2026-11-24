from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import create_access_token, hash_password, verify_password
from app.db import atomic_session, get_session
from app.errors import ApiError
from app.models import Analyst
from app.schemas import (
    COMMON_ERROR_RESPONSES,
    CONFLICT_RESPONSE,
    AccessToken,
    AnalystPublic,
    Credentials,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=AnalystPublic,
    status_code=status.HTTP_201_CREATED,
    responses={422: COMMON_ERROR_RESPONSES[422], 409: CONFLICT_RESPONSE},
)
def register(payload: Credentials, session: Session = Depends(get_session)) -> AnalystPublic:
    password_hash = hash_password(payload.password)
    try:
        with atomic_session(session):
            existing = session.scalar(
                select(Analyst.id).where(Analyst.username == payload.username)
            )
            if existing is not None:
                raise ApiError(409, "username_taken", "That username is already registered")
            analyst = Analyst(username=payload.username, password_hash=password_hash)
            session.add(analyst)
            session.flush()
            result = AnalystPublic(id=analyst.id, username=analyst.username)
    except IntegrityError:
        raise ApiError(409, "username_taken", "That username is already registered") from None
    return result


@router.post(
    "/login",
    response_model=AccessToken,
    responses={401: COMMON_ERROR_RESPONSES[401], 422: COMMON_ERROR_RESPONSES[422]},
)
def login(payload: Credentials, session: Session = Depends(get_session)) -> AccessToken:
    analyst = session.scalar(select(Analyst).where(Analyst.username == payload.username))
    if analyst is None or not verify_password(payload.password, analyst.password_hash):
        raise ApiError(401, "invalid_credentials", "Username or password is incorrect")
    return AccessToken(access_token=create_access_token(analyst.id))
