import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CustomProvider } from 'rsuite';

import { initializeObservability} from './lib/observability';
import { queryClient } from './lib/query-client';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppRoutes } from './router';
import { TelemetryRoute } from './lib/observability/TelemetryRoute';
import { TelemetryBoundary } from './lib/observability/TelemetryBoundary';

import './index.css';
import 'rsuite/dist/rsuite-no-reset.min.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// Start Faro before rendering.
// Does nothing while VITE_FARO_ENABLED=false.
initializeObservability();

createRoot(container).render(
  <StrictMode>
    {/* Catch React rendering errors and show a reload screen. */}
    <TelemetryBoundary>
      <CustomProvider theme="dark">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {/* Track page changes. This displays nothing. */}
            <TelemetryRoute />

            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </CustomProvider>
    </TelemetryBoundary>
  </StrictMode>,
);