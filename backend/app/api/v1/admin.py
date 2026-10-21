"""Admin settings routes. For now, only the alert email list kept in Grafana."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import SuperAdminUser, CSRFProtected
from app.observability import alerts

router = APIRouter()


class AlertSettings(BaseModel):
    """Alert email recipients; both the body and the response of /admin/alerts."""

    emails: list[EmailStr]


@router.get("/alerts", response_model=AlertSettings)
async def get_alerts(user: SuperAdminUser):
    """Who gets alert emails -- read from Grafana, which is where they live."""

    return AlertSettings(emails=await alerts.current_emails())


@router.put("/alerts", response_model=AlertSettings, dependencies=[CSRFProtected])
async def set_alerts(body: AlertSettings, user: SuperAdminUser):
    """Replace the alert email list. Super admins only.
    
        Also re-pushes every alert rule to Grafana, so rule changes in code take effect
        here too. 400 for an empty list; 502 if Grafana refuses.
    """

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
