"""CLI tool to create a new user.

Usage:
    python -m youtube_monitor.management.create_user --username admin --password secret
"""

import argparse
import asyncio
import sys
from youtube_monitor.database import AsyncSessionLocal
from youtube_monitor.crud import user as user_crud
from youtube_monitor.models.user import UserRole


async def main():
    parser = argparse.ArgumentParser(description="Create a new user")
    parser.add_argument("--username", required=True, help="Username")
    parser.add_argument("--password", required=True, help="Password")
    parser.add_argument("--email", default=None, help="Email (optional)")
    parser.add_argument(
        "--role",
        choices=["viewer", "content_admin", "user_admin"],
        default="viewer",
        help="User role (default: viewer)",
    )
    args = parser.parse_args()

    role = UserRole(args.role)

    async with AsyncSessionLocal() as db:
        existing = await user_crud.get_user_by_username(db, args.username)
        if existing:
            print(f"Error: User '{args.username}' already exists.", file=sys.stderr)
            sys.exit(1)
        user = await user_crud.create_user(db, args.username, args.password, args.email, role=role)
        print(f"Created user: {user.username} (id={user.id}, role={user.role.value})")


if __name__ == "__main__":
    asyncio.run(main())
