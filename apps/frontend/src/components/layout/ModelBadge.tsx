import { Badge } from "@ritme/design";
import { IconSparkle } from "@/components/ui/icons";
import { usePrivacy } from "@/lib/queries";
import { s } from "@/i18n";

/**
 * Which model processes the user's text, taken from GET /api/privacy (modelProvider), never hardcoded.
 * Shows nothing until the server has answered, and nothing if it can't.
 */
export function ModelBadge() {
  const privacy = usePrivacy();
  if (!privacy.data?.modelProvider) return null;
  return (
    <span data-testid="model-badge" className="hidden sm:inline-flex">
      <Badge tone="neutral" icon={<IconSparkle />}>
        {s.nav.modelBadge(privacy.data.modelProvider)}
      </Badge>
    </span>
  );
}
