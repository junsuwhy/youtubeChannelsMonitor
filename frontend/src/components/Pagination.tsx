import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const start = total > 0 ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    
    return pages;
  };

  if (total === 0) return null;

  return (
    <div 
      data-testid="pagination" 
      className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4"
    >
      <div className="text-sm text-muted-foreground">
        顯示 {start}-{end} / 共 {total} 筆
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="h-8 w-8 p-0 sm:w-auto sm:px-3"
        >
          <ChevronLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">上一頁</span>
        </Button>
        
        {getPageNumbers().map((p, i) => (
          <React.Fragment key={i}>
            {p === '...' ? (
              <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant={page === p ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(p as number)}
                className="h-8 w-8 p-0"
              >
                {p}
              </Button>
            )}
          </React.Fragment>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
          className="h-8 w-8 p-0 sm:w-auto sm:px-3"
        >
          <span className="hidden sm:inline">下一頁</span>
          <ChevronRight className="h-4 w-4 sm:ml-1" />
        </Button>
      </div>
    </div>
  );
}
