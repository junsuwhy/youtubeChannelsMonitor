import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders 監控中 for active status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('監控中');
  });

  it('renders 已暫停 for paused status', () => {
    render(<StatusBadge status="paused" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('已暫停');
  });

  it('renders 已刪除 for deleted status', () => {
    render(<StatusBadge status="deleted" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('已刪除');
  });

  it('handles unknown status without crashing', () => {
    render(<StatusBadge status="unknown_xyz" />);
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
  });

  it('renders the raw status string for unknown status', () => {
    render(<StatusBadge status="unknown_xyz" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('unknown_xyz');
  });

  it('renders 公開 for public status', () => {
    render(<StatusBadge status="public" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('公開');
  });
});
