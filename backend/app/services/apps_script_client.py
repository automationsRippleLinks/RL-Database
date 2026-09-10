import httpx

from fastapi import HTTPException, status

from app.core.config import settings

VALID_ACTIONS = ("getPitchMasterData", "getCampaignMasterData")

class Client:
    async def _make_api_call(self, action: str, timeout: int = 120) -> dict:
        if action is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="action not provided, to make api_call to apps script",
            )
        elif action not in VALID_ACTIONS:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Invalid Action : {action} for apps script api_call",
            )

        timeout = min(timeout, settings.APPS_SCRIPT_API_CALL_TIMEOUT)
        payload = {
            "action": action,
            "secret": settings.APPS_SCRIPT_API_SECRET,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.post(settings.APPS_SCRIPT_API_URL, json=payload)

            response.raise_for_status()
        except Exception as e:
            print(f"Api_call exception: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="something went wrong while making the api_call to apps script",
            )

        return response.json()

    async def fetch_pitch_master_data(self) -> dict:
        response = await self._make_api_call("getPitchMasterData", timeout=250)
        return response

    async def fetch_campaign_master_data(self) -> dict:
        response = await self._make_api_call("getCampaignMasterData", timeout=60)
        return response