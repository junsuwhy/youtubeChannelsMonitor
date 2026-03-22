import React from 'react';
import { render, screen } from '@testing-library/react';
import { SourceBadge } from '@/components/SourceBadge';

describe('SourceBadge', () => {
  it('renders 手動新增 for manual source', () => {
    render(<SourceBadge source="manual" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('手動新增');
  });

  it('renders Cofacts for cofacts source', () => {
    render(<SourceBadge source="cofacts" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('Cofacts');
  });

  it('handles unknown source without crashing', () => {
    render(<SourceBadge source="unknown_src" />);
    expect(screen.getByTestId('source-badge')).toBeInTheDocument();
  });

  it('renders the raw source string for unknown source', () => {
    render(<SourceBadge source="unknown_src" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('unknown_src');
  });

  it('renders Blocklist for blocklist source', () => {
    render(<SourceBadge source="blocklist" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('Blocklist');
  });
});
