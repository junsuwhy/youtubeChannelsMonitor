import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: '監控中', className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100' },
  paused: { label: '已暫停', className: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100' },
  terminated: { label: '已終止', className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100' },
  public: { label: '公開', className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100' },
  deleted: { label: '已刪除', className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100' },
  private: { label: '私人', className: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100' },
  unlisted: { label: '不公開', className: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100' },
};

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100',
  };

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
      data-testid="status-badge"
    >
      {config.label}
    </Badge>
  );
}
