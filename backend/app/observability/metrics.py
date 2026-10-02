from opentelemetry import metrics
from opentelemetry.metrics import Observation

_meter = metrics.get_meter("ripple-pulse")

INGEST_JOBS = _meter.create_counter(
    name="pulse.ingest.jobs",
    unit="{job}",
    description="Finished ingest jobs, by source and status",
)
AI_TOKENS = _meter.create_counter(
    name="pulse.ai.tokens",
    unit="{token}",
    description="Tokens sent to / received from AI parser",
)
API_ERRORS = _meter.create_counter(
    name="pulse.api.errors",
    unit="{response}",
    description="Responses with a 5xx status, or unhandled exceptions",
)
APIFY_RUNS = _meter.create_counter(
    name="pulse.apify.runs",
    unit="{run}",
    description="Finished Apify runs, by actor and status",
)
APIFY_OVERDUE = _meter.create_counter(
    name="pulse.apify.overdue",
    unit="{run}",
    description="Times the sweep found a run whose webhook is overdue",
)


def init_worker_metrics(sources: list[str], actors: list[str]) -> None:
    _meter.create_observable_gauge(
        name="pulse.worker.up",
        callbacks=[lambda _: [Observation(1)]],
        description="1 per live worker process",
    )
    for source in sources:
        for dry_run in (True, False):
            for reason in ("data", "system"):
                INGEST_JOBS.add(
                    amount=0,
                    attributes={
                        "source": source,
                        "status": "failed",
                        "dry_run": dry_run,
                        "reason": reason,
                    },
                )
    for actor in actors:
        APIFY_RUNS.add(amount=0, attributes={"actor": actor, "status": "failed"})
        APIFY_OVERDUE.add(amount=0, attributes={"actor": actor})
