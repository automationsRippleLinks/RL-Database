import { MissingDataPage } from "@/features/analytics/creators/MissingDataPage";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

/**
 * /analytics/creators. Live data (see MissingDataPage).
 */
export function CreatorAnalyticsPage() {
  useDocumentTitle("Creator analytics");
  return <MissingDataPage />;
}
