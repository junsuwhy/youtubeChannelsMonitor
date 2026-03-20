"""CLI tool to create a new user.

Usage:
    python -m youtube_monitor.management.create_user --username admin --password secret
"""

import argparse
import asyncio
import sys
from youtube_monitor.database import AsyncSessionLocal
from youtube_monitor.crud import user as user_crud


async def main():
    parser = argparse.ArgumentParser(description="Create a new user")
    parser.add_argument("--username", required=True, help="Username")
    parser.add_argument("--password", required=True, help="Password")
    parser.add_argument("--email", default=None, help="Email (optional)")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        existing = await user_crud.get_user_by_username(db, args.username)
        if existing:
            print(f"Error: User '{args.username}' already exists.", file=sys.stderr)
            sys.exit(1)
        user = await user_crud.create_user(db, args.username, args.password, args.email)
        print(f"Created user: {user.username} (id={user.id})")


if __name__ == "__main__":
    asyncio.run(main())
