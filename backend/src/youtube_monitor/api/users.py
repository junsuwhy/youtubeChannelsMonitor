from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from youtube_monitor.database import get_session
from youtube_monitor.auth.deps import require_user_admin, get_current_user
from youtube_monitor.models.user import User, UserRole
from youtube_monitor.crud import user as user_crud

router = APIRouter()


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: UserRole = UserRole.viewer


class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


@router.get("", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_user_admin),
):
    return await user_crud.get_all_users(db)


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_user_admin),
):
    existing = await user_crud.get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=400, detail="使用者名稱已存在")
    return await user_crud.create_user(
        db, body.username, body.password, body.email, role=body.role
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_user_admin),
):
    updates = body.model_dump(exclude_none=True)
    user = await user_crud.update_user(db, user_id, **updates)
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    return user


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_user_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能停用自己")
    user = await user_crud.update_user(db, user_id, is_active=False)
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
