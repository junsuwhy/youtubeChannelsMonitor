import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sourceConfig: Record<string, { label: string; className: string }> = {
  manual: { label: '手動新增', className: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-50' },
  cofacts: { label: 'Cofacts', className: 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-50' },
  blocklist: { label: 'Blocklist', className: 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-50' },
};

export interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const config = sourceConfig[source.toLowerCase()] || {
    label: source,
    className: 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-50',
  };

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
      data-testid="source-badge"
    >
      {config.label}
    </Badge>
  );
}
