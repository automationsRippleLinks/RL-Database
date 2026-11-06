""" Teams: a group of colleagues, so a list can be shared with "my team" . """

from typing import Optional
from sqlmodel import SQLModel, Field

class Team(SQLModel, table=True):
    """ a team such as "sales". a user belongs to at most one(user.team_id)
    there is no admin screen for teams yet; they are created and assigned in sql"""

    id: Optional[int] = Field(default=None, primary_key=True)
   
    name: str= Field (nullable=False, unique=True)
    
