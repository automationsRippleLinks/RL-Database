from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import SuperAdminUser, CSRFProtected
from app.observability import alerts

router = APIRouter()


class AlertSettings(BaseModel):
    emails: list[EmailStr]


@router.get("/alerts", response_model=AlertSettings)
async def get_alerts(user: SuperAdminUser):
    return AlertSettings(emails=await alerts.current_emails())


@router.put("/alerts", response_model=AlertSettings, dependencies=[CSRFProtected])
async def set_alerts(body: AlertSettings, user: SuperAdminUser):
    if not body.emails:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one email is needed",
        )
    try:
        await alerts.apply([str(e) for e in body.emails])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, 
            detail=f"Grafana rejected the change: {e}"
        )
    return body

