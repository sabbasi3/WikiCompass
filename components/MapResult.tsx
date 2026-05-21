// Page-section composer for a successfully-generated map. Each child
// renders one block of the result UI; this file just lays them out.
//
// Used by the home-page lookup flow (via ResultsByState). The journey
// page composes the same blocks at its own level so the static ones
// can render as Server Components — see app/journey/[id]/page.tsx.

import { GroundingPanel } from "@/components/map-result/GroundingPanel";
import { LearningPath } from "@/components/map-result/LearningPath";
import { MapInteractive } from "@/components/map-result/MapInteractive";
import { TopicOverview } from "@/components/map-result/TopicOverview";
import { WarningsPanel } from "@/components/map-result/WarningsPanel";
import type { Grounding, WikiMap } from "@/lib/schemas";
import type { MapMeta } from "@/hooks/useWikiMap";

export function MapResult({
  map,
  grounding,
  meta,
}: {
  map: WikiMap;
  grounding: Grounding;
  meta: MapMeta;
}) {
  return (
    <div className="space-y-6">
      <TopicOverview map={map} meta={meta} />
      <WarningsPanel warnings={map.warnings} />
      <MapInteractive map={map} />
      <LearningPath path={map.learningPath} whyThisPath={map.whyThisPath} />
      <GroundingPanel grounding={grounding} />
    </div>
  );
}
