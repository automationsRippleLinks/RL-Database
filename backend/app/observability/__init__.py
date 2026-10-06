import logging
import sys
import socket
import os
from urllib.parse import unquote

from fastapi import FastAPI, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine
from opentelemetry import trace, metrics as otel_metrics
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.core.config import settings

tracer = trace.get_tracer("ripple-pulse")

_providers: list = []


class _TraceIds(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        ctx = trace.get_current_span().get_span_context()
        record.trace_id = format(ctx.trace_id, "032x") if ctx.is_valid else "-"
        return True


def _headers() -> dict[str, str]:
    pairs = [
        h.split("=", 1)
        for h in settings.OTEL_EXPORTER_OTLP_HEADERS.split(",")
        if "=" in h
    ]
    return {k.strip(): unquote(v.strip()) for k, v in pairs}


def setup(service: str) -> None:
    if _providers:
        return

    console = logging.StreamHandler(sys.stdout)
    console.addFilter(_TraceIds())
    console.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s [%(trace_id)s] %(message)s"
        )
    )
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)
    root.handlers = [console]

    if not settings.OTEL_ENABLED:
        _providers.append(None)
        return

    resource = Resource.create(
        {
            "service.name": service,
            "service.namespace": "ripple-pulse",
            "service.instance.id": f"{socket.gethostname()}-{os.getpid()}",
            "deployment.environment.name": settings.ENVIRONMENT.lower(),
        }
    )
    base, headers = settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip("/"), _headers()

    traces = TracerProvider(resource=resource)
    traces.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{base}/v1/traces", headers=headers)
        )
    )
    trace.set_tracer_provider(tracer_provider=traces)

    meters = MeterProvider(
        resource=resource,
        metric_readers=[
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=f"{base}/v1/metrics", headers=headers),
                export_interval_millis=settings.OTEL_METRIC_INTERVAL_SECONDS * 1000,
            )
        ],
    )
    otel_metrics.set_meter_provider(meter_provider=meters)

    logs = LoggerProvider(resource=resource)
    logs.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(endpoint=f"{base}/v1/logs", headers=headers)
        )
    )
    root.addHandler(LoggingHandler(level=logging.INFO, logger_provider=logs))

    HTTPXClientInstrumentor().instrument()
    _providers.extend([traces, meters, logs])


def instrument_app(app: FastAPI) -> None:
    from .metrics import API_ERRORS

    @app.middleware("http")
    async def count_errors(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception:
            API_ERRORS.add(amount=1)
            raise
        if response.status_code >= 500:
            API_ERRORS.add(amount=1)
        return response

    API_ERRORS.add(amount=0)

    if settings.OTEL_ENABLED:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app=app, excluded_urls="health/.*,home")


def instrument_clients(engine: AsyncEngine, redis: Redis) -> None:
    if settings.OTEL_ENABLED:
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
        RedisInstrumentor.instrument_client(client=redis)


def shutdown() -> None:
    for p in _providers:
        if p is not None:
            p.shutdown()
