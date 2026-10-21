"""Alert rules and the email contact point, written to Grafana through its API.

    python -m app.observability.alerts        # apply ALERT_EMAILS + the rules

Safe to run any number of times: it creates or replaces the same folder,
contact point and rule group. The admin routes call the same apply(), so the
recipients can also be changed without a deploy. Grafana stores them -- there
is no table for this in our database.

Works against local otel-lgtm (admin/admin) and Grafana Cloud (service
account token with the "Alerting: Editor" role, or Admin).
"""

from dataclasses import dataclass
import httpx
import asyncio

from app.core.config import settings

FOLDER_UID = "ripple-pulse"
GROUP = "ripple-pulse"
CONTACT_UID = "ripple-pulse-email"
CONTACT_NAME = "Ripple Pulse email"


@dataclass(frozen=True)
class Rule:
    """One alert: fires when the PromQL `expr` is `op` ("gt"/"lt") `threshold`.
    
        `window_seconds` is how far back the query looks; `no_data` is Grafana's
        state when the query returns nothing.
    """

    uid: str
    title: str
    expr: str
    op: str
    threshold: float
    summary: str
    window_seconds: int = 600
    no_data: str = "OK"


def rules() -> list[Rule]:
    """The rule set, scoped to this ENVIRONMENT's series."""

    env = f'deployment_environment_name="{settings.ENVIRONMENT.lower()}"'
    silent = settings.ALERT_WORKER_SILENT_MINUTES
    return [
        Rule(
            uid="pulse-ingest-failed",
            title="Ingest job failed",
            # a dry run failing on bad sheet data is expected; only our failures alert
            expr=f'sum(increase(pulse_ingest_jobs_total{{{env},status="failed",dry_run="false"}}[10m]))'
            f' + sum(increase(pulse_ingest_jobs_total{{{env},status="failed",dry_run="true",reason="system"}}[10m]))',
            op="gt",
            threshold=0,
            summary="An ingest job failed. Open the Ingest page for its errors.",
        ),
        Rule(
            uid="pulse-apify-failed",
            title="Apify run failed",
            expr=f'sum(increase(pulse_apify_runs_total{{{env},status="failed"}}[10m]))',
            op="gt",
            threshold=0,
            summary="An Apify run failed or its results could not be processed.",
        ),
        Rule(
            uid="pulse-apify-overdue",
            title="Apify webhook overdue",
            expr=f"sum(increase(pulse_apify_overdue_total{{{env}}}[15m]))",
            op="gt",
            threshold=0,
            summary=f"An Apify run has had no webhook for over {settings.ALERT_APIFY_OVERDUE_MINUTES} minutes. "
            "Check PUBLIC_API_URL and the run in the Apify console.",
            window_seconds=900,
        ),
        Rule(
            "pulse-worker-silent",
            "Worker not reporting",
            f"sum(max_over_time(pulse_worker_up{{{env}}}[{silent}m]))",
            "lt",
            1,
            f"No background worker has reported for {silent} minutes. Uploads and Apify results are not being processed.",
            window_seconds=silent * 60,
            # a dead worker sends nothing at all, so missing data is the alert
            no_data="Alerting",
        ),
        Rule(
            "pulse-api-errors",
            "API returning errors",
            f"sum(increase(pulse_api_errors_total{{{env}}}[5m]))",
            "gt",
            0,
            "The API returned server errors (5xx) in the last 5 minutes.",
            window_seconds=300,
        ),
    ]


def _client() -> httpx.AsyncClient:
    """Grafana API client: GRAFANA_TOKEN if set, else local admin/admin."""

    if settings.GRAFANA_TOKEN:
        auth = {"headers": {"Authorization": f"Bearer {settings.GRAFANA_TOKEN}"}}
    else:
        auth = {"auth": ("admin", "admin")}
    return httpx.AsyncClient(
        base_url=settings.GRAFANA_URL.rstrip("/"), timeout=30, **auth
    )


async def _prometheus_uid(c: httpx.AsyncClient) -> str:
    """UID of the Prometheus data source the rules query.
    
        GRAFANA_PROMETHEUS_UID if set; otherwise the default Prometheus source, then
        one named "*-prom" (Grafana Cloud's naming). Raises if there is none.
    """

    if settings.GRAFANA_PROMETHEUS_UID:
        return settings.GRAFANA_PROMETHEUS_UID
    r = await c.get("/api/datasources")
    r.raise_for_status()
    proms = [ds for ds in r.json() if ds.get("type") == "prometheus"]
    if not proms:
        raise RuntimeError(
            "No Prometheus data source in Grafana: set GRAFANA_PROMETHEUS_UID"
        )
    proms.sort(
        key=lambda ds: (
            not ds.get("isDefault"),
            not ds.get("name", "").endswith("-prom"),
        )
    )
    return proms[0]["uid"]


def _rule_json(rule: Rule, ds_uid: str) -> dict:
    """Grafana provisioning JSON: query A, threshold B on it, mail our contact point."""
    return {
        "uid": rule.uid,
        "title": rule.title,
        "folderUID": FOLDER_UID,
        "ruleGroup": GROUP,
        "condition": "B",
        "data": [
            {
                "refId": "A",
                "relativeTimeRange": {"from": rule.window_seconds, "to": 0},
                "datasourceUid": ds_uid,
                "model": {
                    "refId": "A",
                    "expr": rule.expr,
                    "instant": True,
                    "range": False,
                },
            },
            {
                "refId": "B",
                "datasourceUid": "__expr__",
                "model": {
                    "refId": "B",
                    "type": "threshold",
                    "expression": "A",
                    "conditions": [
                        {"evaluator": {"type": rule.op, "params": [rule.threshold]}}
                    ],
                },
            },
        ],
        "noDataState": rule.no_data,
        "execErrState": "Error",
        "for": "0s",
        "labels": {"app": "ripple-pulse"},
        "annotations": {"summary": rule.summary},
        "notification_settings": {"receiver": CONTACT_NAME},
    }


async def _ensure_folder(c: httpx.AsyncClient) -> None:
    """Create the "Ripple Pulse" alert folder if it isn't there yet."""

    if (await c.get(f"/api/folders/{FOLDER_UID}")).status_code == 404:
        (
            await c.post(
                "/api/folders", json={"uid": FOLDER_UID, "title": "Ripple Pulse"}
            )
        ).raise_for_status()


async def _put_contact_point(c: httpx.AsyncClient, emails: list[str]) -> None:
    body = {
        "uid": CONTACT_UID,
        "name": CONTACT_NAME,
        "type": "email",
        "settings": {"addresses": ";".join(emails), "singleEmail": False},
    }
    # without this Grafana marks the item provisioned and locks it in its UI
    headers = {"X-Disable-Provenance": "true"}
    existing = await c.get(
        "/api/v1/provisioning/contact-points", params={"name": CONTACT_NAME}
    )
    existing.raise_for_status()
    if existing.json():
        r = await c.put(
            f"/api/v1/provisioning/contact-points/{CONTACT_UID}",
            json=body,
            headers=headers,
        )
    else:
        r = await c.post(
            f"/api/v1/provisioning/contact-points", json=body, headers=headers
        )
    r.raise_for_status()


async def apply(emails: list[str]) -> list[str]:
    """Point every rule at these addresses. Returns the rule titles applied."""

    emails = [e.strip() for e in emails if e.strip()]
    if not emails:
        raise ValueError("At least one alert email is needed")
    async with _client() as c:
        ds_uid = await _prometheus_uid(c)
        await _ensure_folder(c)
        await _put_contact_point(c, emails)
        group = {
            "title": GROUP,
            "folderUid": FOLDER_UID,
            "interval": 60,
            "rules": [_rule_json(r, ds_uid) for r in rules()],
        }
        r = await c.put(
            f"/api/v1/provisioning/folder/{FOLDER_UID}/rule-groups/{GROUP}",
            json=group,
            headers={"X-Disable-Provenance": "true"},
        )
        r.raise_for_status()
    return [r.title for r in rules()]

async def current_emails() -> list[str]:
    """Addresses on the contact point now, or [] if apply() has never run."""

    async with _client() as c:
        r = await c.get("/api/v1/provisioning/contact-points", params={"name": CONTACT_NAME})
        r.raise_for_status()
        points = r.json()
    if not points:
        return []
    return [a for a in points[0]["settings"].get("addresses", "").split(";") if a]

if __name__ == "__main__":
    titles = asyncio.run(apply(settings.ALERT_EMAILS))
    print(f"Applied {len(titles)} alert rules in {settings.GRAFANA_URL} -> {', '.join(settings.ALERT_EMAILS)}")
    for t in titles:
        print(f"  - {t}")
