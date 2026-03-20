from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from youtube_monitor.auth.security import decode_token
from youtube_monitor.database import get_session
from youtube_monitor.models.user import User
from youtube_monitor.crud import user as user_crud

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if username is None:
            raise credentials_exception
        # CRITICAL: refresh tokens cannot be used for API access
        if token_type == "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await user_crud.get_user_by_username(db, username)
    if user is None or not user.is_active:
        raise credentials_exception
    return user
