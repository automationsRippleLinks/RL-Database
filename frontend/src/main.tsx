
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CustomProvider } from 'rsuite';

import { queryClient } from './lib/query-client';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppRoutes } from './router';

import './index.css';
import 'rsuite/dist/rsuite-no-reset.min.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <CustomProvider theme="dark">
      <QueryClientProvider client={queryClient}>
        {/* BrowserRouter wraps AuthProvider because the provider navigates on 401. */}
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </CustomProvider>
  </StrictMode>,
);