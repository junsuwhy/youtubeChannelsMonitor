// IMPORTANT: must have data-testid="empty-state"
export function EmptyState({ message = "暫無資料", testId }: { message?: string; testId?: string }) {
  return (
    <div data-testid={testId || "empty-state"} className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">📭</div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}