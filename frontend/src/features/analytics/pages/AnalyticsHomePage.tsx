import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function AnalyticsHomePage() {
  useDocumentTitle("Analytics");
  return <AnalyticsPage />;
}
