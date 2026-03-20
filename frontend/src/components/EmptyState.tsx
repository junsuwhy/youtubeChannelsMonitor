// IMPORTANT: must have data-testid="empty-state"
export function EmptyState({ message = "暫無資料" }: { message?: string }) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center justify-center py-12 text-gray-400">
      <p>{message}</p>
    </div>
  );
}