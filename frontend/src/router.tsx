import { lazy, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { App } from "./App";
import { EmptyState } from "./components/states";
import { AuthCallbackPage } from "./pages/auth/AuthCallbackPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { RequireAuth, RequireIngestPermission } from "./features/auth/guards";
import { HomeScreen } from "./features/pulse/HomeScreen";
import { GlobalSearchPage } from "./pages/search/GlobalSearchPage";
import { CreatorSearchPage } from "./pages/search/CreatorSearchPage";
import { BrandSearchPage } from "./pages/search/BrandSearchPage";
import {CampaignSearchPage} from "./pages/search/CampaignSearchPage";
import { PitchSearchPage } from "./pages/search/PitchSearchPage";

// lazy load detail pages
const CampaignDetailPage = lazy(() =>
  import("./pages/detail/CampaignDetailPage").then((m) => ({
    default: m.CampaignDetailPage,
  })),
);
const PitchDetailPage = lazy(() =>
  import("./pages/detail/PitchDetailPage").then((m) => ({
    default: m.PitchDetailPage,
  })),
);
const AnalyticsHomePage = lazy(() =>
  import("./pages/analytics/AnalyticsHomePage").then((m) => ({
    default: m.AnalyticsHomePage,
  })),
);
const AnalyticsSectionPage = lazy(() =>
  import("./pages/analytics/AnalyticsSectionPage").then((m) => ({
    default: m.AnalyticsSectionPage,
  })),
);
const CreatorAnalyticsPage = lazy(() =>
  import("./pages/analytics/CreatorAnalyticsPage").then((m) => ({
    default: m.CreatorAnalyticsPage,
  })),
);
const IngestPage = lazy(() =>
  import("./pages/ingest/IngestPage").then((m) => ({ default: m.IngestPage })),
);
const TaxonomyPage = lazy(() =>
  import("./pages/taxonomy/TaxonomyPage").then((m) => ({
    default: m.TaxonomyPage,
  })),
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

          {/* No shell route under /search any more: the search box moved into the
              header and the scope tabs became the data rail, both of which live
              in <App>. What is left is the pages themselves. */}
          <Route path="search">
            <Route index element={<SearchHome />} />
            <Route path="creators" element={<CreatorSearchPage />} />
            {/* Brands got the same redesign as Creators — the search page
                manages its own scrolling and the record opens as a drawer,
                so it is not wrapped in <Scoped>/<Page> the way the
                not-yet-redesigned Campaigns and Pitches pages still are. */}
            {/* Brands, Campaigns and Pitches all got the same redesign as
                Creators now — each search page manages its own scrolling,
                so none of them are wrapped in <Scoped>/<Page> any more.
                Campaigns and Pitches keep their own full detail pages
                (no drawer), so a row click there navigates instead of
                opening a URL-param-driven overlay. */}
            <Route path="brands" element={<BrandSearchPage />} />
            <Route path="campaigns" element={<CampaignSearchPage />} />
            <Route path="pitches" element={<PitchSearchPage />} />
          </Route>

          {/*
            Creators have no page of their own any more — the drawer over the
            results replaced it. This redirect keeps every existing link working:
            the brand and campaign detail pages both link to /creators/:id, and so
            do any bookmarks people already have.
          */}
          <Route path="creators/:creatorId" element={<CreatorRedirect />} />

          {/*
            Brands followed the same move: BrandDetailPage is retired in favor
            of the drawer over /search/brands, and this redirect keeps every
            existing /brands/:id link working (campaign and pitch rows, the
            "most-used creators" list, old bookmarks) without having to touch
            each one.
          */}
          <Route path="brands/:brandId" element={<BrandRedirect />} />

          {/* Unlike Brands, Campaigns and Pitches keep their own full detail
              pages rather than folding into a drawer — a row in the new
              CampaignTable/PitchTable navigates straight here instead of
              opening a URL-param overlay, so these routes are unchanged. */}
          <Route
            path="campaigns/:campaignId"
            element={
              <Page>
                <CampaignDetailPage />
              </Page>
            }
          />
          <Route
            path="pitches/:pitchId"
            element={
              <Page>
                <PitchDetailPage />
              </Page>
            }
          />

          {/* Analytics: a four-card home. Creators is built; the other three follow. */}
          <Route path="analytics">
            <Route index element={<AnalyticsHomePage />} />
            <Route path="creators" element={<CreatorAnalyticsPage />} />
            {/* Brands, Campaigns, Pitches: "Coming soon" until their pages exist (see features/analytics/sections.ts). */}
            <Route path=":section" element={<AnalyticsSectionPage />} />
          </Route>

          {/* Editing the taxonomy decides which uploads are accepted at all, so
              it sits behind the same permission as ingest itself. */}
          <Route element={<RequireIngestPermission />}>
            <Route path="ingest" element={<IngestPage />} />
            <Route path="taxonomy" element={<TaxonomyPage />} />
          </Route>

          <Route
            path="*"
            element={
              <Page>
                <EmptyState
                  title="Page not found"
                  description="That URL doesn't match anything in this app."
                />
              </Page>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}

/**
 * The section cards, or — once there is something to search for — the combined
 * results across all four entities. The handoff's home screen is the cards; the
 * combined search is what the old "Everything" tab did and is worth keeping for
 * the case the cards can't serve, which is "I don't know which section it's in".
 */
function SearchHome() {
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  return query ? (
    <Page>
      <GlobalSearchPage />
    </Page>
  ) : (
    <HomeScreen />
  );
}

/** Redesigned pages own their layout; the rest keep the scrolling page they were written for. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
      <div className="mx-auto max-w-[1600px]">{children}</div>
    </div>
  );
}

function CreatorRedirect() {
  const { creatorId } = useParams<{ creatorId: string }>();
  return (
    <Navigate
      to={`/search/creators?creator=${encodeURIComponent(creatorId ?? "")}`}
      replace
    />
  );
}

function BrandRedirect() {
  const { brandId } = useParams<{ brandId: string }>();
  return (
    <Navigate
      to={`/search/brands?brand=${encodeURIComponent(brandId ?? "")}`}
      replace
    />
  );
}
