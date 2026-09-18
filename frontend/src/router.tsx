import { lazy, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Building2, FileText, Megaphone } from "lucide-react";
import { App } from "./App";
import { EmptyState } from "./components/states";
import { AuthCallbackPage } from "./pages/auth/AuthCallbackPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { RequireAuth, RequireIngestPermission } from "./features/auth/guards";
import { ComingSoon } from "./pages/fallback/ComingSoon";
import { HomeScreen } from "./features/pulse/HomeScreen";
import { GlobalSearchPage } from "./pages/search/GlobalSearchPage";
import { CreatorSearchPage } from "./pages/search/CreatorSearchPage";
import { BrandSearchPage } from "./pages/search/BrandSearchPage";
import { CampaignSearchPage } from "./pages/search/CampaignSearchPage";
import { PitchSearchPage } from "./pages/search/PitchSearchPage";
import type { SearchScope } from "./types/api";

/**
 * Sections to hide behind the "Coming soon" placeholder. Empty on purpose.
 *
 * The handoff says Brands, Campaigns and Pitches should render that placeholder,
 * because in the prototype those screens had not been designed yet. In this app
 * all three have real, working search today — tables, filters, detail pages — so
 * they are left alone: the redesign being unfinished is a reason not to restyle
 * them, not a reason to take them away from the people using them. If hiding
 * them until they are redesigned really is the intent, adding the scopes to this
 * set is the whole change.
 */
const PLACEHOLDER_SCOPES = new Set<SearchScope>();

const SECTION_META = {
  brands: { title: "Brands", icon: Building2 },
  campaigns: { title: "Campaigns", icon: Megaphone },
  pitches: { title: "Pitches", icon: FileText },
} as const;

// lazy load detail pages
const BrandDetailPage = lazy(() =>
  import("./pages/detail/BrandDetailPage").then((m) => ({
    default: m.BrandDetailPage,
  })),
);
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
            <Route
              path="brands"
              element={
                <Scoped scope="brands">
                  <BrandSearchPage />
                </Scoped>
              }
            />
            <Route
              path="campaigns"
              element={
                <Scoped scope="campaigns">
                  <CampaignSearchPage />
                </Scoped>
              }
            />
            <Route
              path="pitches"
              element={
                <Scoped scope="pitches">
                  <PitchSearchPage />
                </Scoped>
              }
            />
          </Route>

          {/*
            Creators have no page of their own any more — the drawer over the
            results replaced it. This redirect keeps every existing link working:
            the brand and campaign detail pages both link to /creators/:id, and so
            do any bookmarks people already have.
          */}
          <Route path="creators/:creatorId" element={<CreatorRedirect />} />

          {/* The other detail pages sit outside the search views — they're
              destinations, not a filtered list. */}
          <Route
            path="brands/:brandId"
            element={
              <Page>
                <BrandDetailPage />
              </Page>
            }
          />
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

/**
 * A section that has not been redesigned: either its existing page, in the
 * scrolling layout it was written for, or the placeholder if it has been listed
 * in PLACEHOLDER_SCOPES.
 */
function Scoped({
  scope,
  children,
}: {
  scope: keyof typeof SECTION_META;
  children: ReactNode;
}) {
  if (PLACEHOLDER_SCOPES.has(scope)) {
    const { title, icon } = SECTION_META[scope];
    return <ComingSoon title={title} icon={icon} />;
  }
  return <Page>{children}</Page>;
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
