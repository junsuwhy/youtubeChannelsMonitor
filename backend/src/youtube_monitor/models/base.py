import datetime
from sqlalchemy.orm import DeclarativeBase, mapped_column, MappedColumn
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy import func


class Base(AsyncAttrs, DeclarativeBase):
    pass
