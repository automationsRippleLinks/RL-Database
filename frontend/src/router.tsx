import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { EmptyState } from './components/states';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { LoginPage } from './features/auth/LoginPage';
import { SignUpPage } from './features/auth/SignUpPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { RequireAuth, RequireIngestPermission } from './features/auth/guards';
import { SearchLayout } from './features/search/SearchLayout';
import { GlobalSearchPage } from './features/search/GlobalSearchPage';
import { CreatorSearchPage } from './features/search/creators/CreatorSearchPage';
import { BrandSearchPage } from './features/search/brands/BrandSearchPage';
import { CampaignSearchPage } from './features/search/campaigns/CampaignSearchPage';
import { PitchSearchPage } from './features/search/pitches/PitchSearchPage';

/**
 * Search is what people open the app for, so it stays in the main bundle. Detail
 * pages and the ingest screen are split out — the detail pages carry wide column
 * definitions nobody needs until they click through, and ingest is visible to only
 * a handful of accounts.
 */
const CreatorDetailPage = lazy(() =>
  import('./features/search/creators/CreatorDetailPage').then((m) => ({ default: m.CreatorDetailPage })),
);
const BrandDetailPage = lazy(() =>
  import('./features/search/brands/BrandDetailPage').then((m) => ({ default: m.BrandDetailPage })),
);
const CampaignDetailPage = lazy(() =>
  import('./features/search/campaigns/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })),
);
const PitchDetailPage = lazy(() =>
  import('./features/search/pitches/PitchDetailPage').then((m) => ({ default: m.PitchDetailPage })),
);
const IngestPage = lazy(() =>
  import('./features/ingest/IngestPage').then((m) => ({ default: m.IngestPage })),
);
const TaxonomyPage = lazy(() =>
  import('./features/taxonomy/TaxonomyPage').then((m) => ({ default: m.TaxonomyPage })),
);

export function AppRoutes() {
  return (
    <Routes>
      {/*
        Public. The verify-email and reset-password routes MUST stay outside
        <RequireAuth> — someone following a link from their inbox has no session yet,
        and a guard would bounce them to login and break the very flow the email
        exists to start.
      */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Everything else requires a session */}
      <Route element={<RequireAuth />}>
        <Route element={<App />}>
          <Route index element={<Navigate to="/search" replace />} />

          {/* The search shell owns the omnibox and scope tabs, so the query text
              survives switching between global and scoped views. */}
          <Route path="search" element={<SearchLayout />}>
            <Route index element={<GlobalSearchPage />} />
            <Route path="creators" element={<CreatorSearchPage />} />
            <Route path="brands" element={<BrandSearchPage />} />
            <Route path="campaigns" element={<CampaignSearchPage />} />
            <Route path="pitches" element={<PitchSearchPage />} />
          </Route>

          {/* Detail pages sit outside the search shell — they're destinations, not
              a filtered list, and shouldn't carry the tab bar. */}
          <Route path="creators/:creatorId" element={<CreatorDetailPage />} />
          <Route path="brands/:brandId" element={<BrandDetailPage />} />
          <Route path="campaigns/:campaignId" element={<CampaignDetailPage />} />
          <Route path="pitches/:pitchId" element={<PitchDetailPage />} />

          {/* Editing the taxonomy decides which uploads are accepted at all, so
              it sits behind the same permission as ingest itself. */}
          <Route element={<RequireIngestPermission />}>
            <Route path="ingest" element={<IngestPage />} />
            <Route path="taxonomy" element={<TaxonomyPage />} />
          </Route>

          <Route
            path="*"
            element={
              <EmptyState
                title="Page not found"
                description="That URL doesn't match anything in this app."
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
