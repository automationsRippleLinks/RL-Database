import {
    getWebInstrumentations,
    initializeFaro,
    LogLevel,
} from '@grafana/faro-react';
import { sanitizeTelemetry } from './privacy';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// Prevent Faro from starting more than once.
let initialized = false;
// Store the Faro instance so our logging functions can use it.
// It stays undefined while logging is disabled.
let faroClient: ReturnType<typeof initializeFaro> | undefined;

export function initializeObservability() {
    // Read the settings from your .env file.
    const enabled = import.meta.env.VITE_FARO_ENABLED === 'true';
    const collectorUrl =
        import.meta.env.VITE_FARO_COLLECTOR_URL?.trim();

    // Do nothing while logging is disabled or the URL is empty.
    if (!enabled || !collectorUrl || initialized) return;

    try {
        const url = new URL(collectorUrl);

        // Prevent requests to our dummy collector address.
        // Replace the dummy URL in .env when Grafana is ready.
        if (url.hostname.endsWith('.invalid')) return;
        // Save the initialized Faro instance.
        const apiOrigin = new URL(import.meta.env.VITE_PROXY_TARGET + import.meta.env.VITE_API_BASE_URL).origin;
        const escapedApi = apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        faroClient = initializeFaro({
            // The real collector will receive the frontend telemetry here.
            url: collectorUrl,

            // Identifies this applicatpion inside Grafana.
            app: {
                name: 'ripple-pulse-web',
                version: import.meta.env.VITE_APP_VERSION || '0.1.0',
                environment:
                    import.meta.env.VITE_APP_ENVIRONMENT || 'development',
            },
            // Clean telemetry immediately before Faro sends it.
            beforeSend: (item) => sanitizeTelemetry(item) as typeof item,

            // Collect browser errors and performance information.
            // Console capture is off because console messages may
            // contain private application data.
            instrumentations: [
                ...getWebInstrumentations({ captureConsole: false }),
                new TracingInstrumentation({
                    instrumentationOptions: {
                        propagateTraceHeaderCorsUrls: [new RegExp(`^${escapedApi}/`)],
                    }
                }),
            ],

            // Avoid exposing the Faro instance on window.
            preventGlobalExposure: true,
        });

        initialized = true;
    } catch {
        // A logging setup failure should not stop the application.
    }
}

// Logging failures must not interrupt normal application behaviour.
function safelyLog(action: () => void): void {
    try {
        action();
    } catch {
        // Do not log this failure again, which could cause a loop.
    }
}

// Only pass short, non-sensitive metadata.
// Example: { feature: 'creators', status: '500' }
type LogContext = Record<string, string>;

export const logger = {
    // Record a normal application message.
    info(message: string, context: LogContext = {}): void {
        safelyLog(() => {
            faroClient?.api.pushLog([message], {
                level: LogLevel.INFO,
                context,
            });
        });
    },

    // Record a failure, such as an unsuccessful API request.
    error(message: string, context: LogContext = {}): void {
        safelyLog(() => {
            faroClient?.api.pushLog([message], {
                level: LogLevel.ERROR,
                context,
            });
        });
    },

    // Record a specific action, such as completing an export.
    event(name: string, attributes: LogContext = {}): void {
        safelyLog(() => {
            faroClient?.api.pushEvent(name, attributes);
        });
    },
};

// Report React errors through Faro.
// Uses the safelyLog function and faroClient we added earlier.
export function reportReactError(error: Error): void {
    safelyLog(() => {
        faroClient?.api.pushError(error, {
            context: { source: 'react' },
        });
    });
}


// Remember the previous page to avoid duplicate updates.
let lastTrackedPage: string | undefined;

// Called by TelemetryRoute.tsx whenever the page changes.
export function trackPage(pathname: string): void {
    // Remove query parameters and hide record IDs.
    const page = pathname
        .split(/[?#]/)[0]
        .replace(
            /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
            '/:id',
        )
        .replace(/\/\d+(?=\/|$)/g, '/:id');

    // Skip updates while Faro is disabled or the page is unchanged.
    if (!faroClient || page === lastTrackedPage) return;

    safelyLog(() => {
        faroClient?.api.setView({ name: page });
        lastTrackedPage = page;
    });
}

export function setObservabilityUser(id: number | null): void {
  safelyLog(() => {
    if (!faroClient) return;
    if (id === null) faroClient.api.resetUser();
    else faroClient.api.setUser({ id: String(id) });
  });
}