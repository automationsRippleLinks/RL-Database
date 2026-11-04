import { MissingDataPage } from "@/features/analytics/creators/MissingDataPage";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function CreatorAnalyticsPage() {
  useDocumentTitle("Creator analytics");
  return <MissingDataPage />;
}