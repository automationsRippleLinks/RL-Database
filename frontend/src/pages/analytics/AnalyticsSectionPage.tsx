import { Navigate, useParams } from "react-router-dom";
import { SECTIONS } from "@/features/analytics/sections";
import { ComingSoon } from "@/pages/fallback/ComingSoon";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

/** /analytics/:section for the sections that are not built yet. */
export function AnalyticsSectionPage() {
  const { section } = useParams<{ section: string }>();
  const s = SECTIONS.find((x) => x.id === section);
  useDocumentTitle(s ? `${s.title} analytics` : undefined);
  if (!s) return <Navigate to="/analytics" replace />;
  return <ComingSoon title={`${s.title} analytics`} icon={s.icon} />;
}
