from pydantic import BaseModel
from typing import List


class DailyStatPoint(BaseModel):
    date: str
    value: int

    model_config = {"from_attributes": True}


class DailyStatResponse(BaseModel):
    items: List[DailyStatPoint]
