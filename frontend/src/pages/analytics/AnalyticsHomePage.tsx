import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function AnalyticsHomePage() {
  useDocumentTitle("Analytics");
  return <AnalyticsPage />;
}
