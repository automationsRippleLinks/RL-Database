from uuid import UUID

from taskiq_redis import RedisStreamBroker
from taskiq import TaskiqScheduler, TaskiqEvents, TaskiqState, Context, TaskiqDepends
from taskiq.schedule_sources import LabelScheduleSource
from taskiq.middlewares.opentelemetry_middleware import OpenTelemetryMiddleware

from app.core.config import settings
from app.core.db import create_engine, create_session_factory
from app.core.redis_client import create_redis, create_redis_pool
from app import observability
from app.observability.metrics import init_worker_metrics

broker = RedisStreamBroker(
    url=str(settings.REDIS_URL), queue_name=settings.WORKER_QUEUE_NAME
)
broker.add_middlewares(OpenTelemetryMiddleware())
scheduler = TaskiqScheduler(broker, sources=[LabelScheduleSource(broker)])


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def _startup(state: TaskiqState) -> None:
    observability.setup("ripple-pulse-worker")
    state.engine = create_engine()
    state.session_factory = create_session_factory(state.engine)
    state.redis = create_redis(create_redis_pool())
    observability.instrument_clients(engine=state.engine, redis=state.redis)
    init_worker_metrics([s.value for s in IngestSource], list(apify.HANDLERS))


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def _shutdown(state: TaskiqState) -> None:
    await state.redis.aclose()
    await state.engine.dispose()
    observability.shutdown()

from app.models import IngestSource
from app.services import apify, ingest
from app.services.jobs import sweep


@broker.task
async def run_ingest_job(job_id: str, ctx: Context = TaskiqDepends()) -> None:
    await ingest.run_job(ctx.state.session_factory, ctx.state.redis, UUID(job_id))


@broker.task
async def process_apify_run(run_id: str, ctx: Context = TaskiqDepends()) -> None:
    await apify.process_run(ctx.state.session_factory, ctx.state.redis, run_id)


@broker.task(schedule=[{"cron": "0 3 * * *", "cron_offset": "Asia/Kolkata"}]) # 30 days
async def refresh_instagram_stats(ctx: Context = TaskiqDepends()) -> None:
    await apify.start_scheduled_refresh(ctx.state.session_factory)


@broker.task(schedule=[{"cron": "*/10 * * * *"}]) # 10 minutes
async def reconcile(ctx: Context = TaskiqDepends()) -> None:
    sf = ctx.state.session_factory
    for job_id in await sweep(sf):
        await run_ingest_job.kiq(str(job_id))
    for run_id in await apify.unfinished_runs(sf):
        await process_apify_run.kiq(run_id)
