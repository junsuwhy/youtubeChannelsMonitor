import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '@/components/Pagination';

describe('Pagination', () => {
  it('renders nothing when total is 0', () => {
    const { container } = render(
      <Pagination page={1} limit={10} total={0} onPageChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders pagination when total > 0', () => {
    render(<Pagination page={1} limit={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('prev button is disabled on page 1', () => {
    render(<Pagination page={1} limit={10} total={50} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('calls onPageChange with next page number when next clicked', () => {
    const mockFn = vi.fn();
    render(<Pagination page={1} limit={10} total={50} onPageChange={mockFn} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mockFn).toHaveBeenCalledWith(2);
  });

  it('shows correct item range text', () => {
    render(<Pagination page={2} limit={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByTestId('pagination')).toHaveTextContent('11');
    expect(screen.getByTestId('pagination')).toHaveTextContent('20');
    expect(screen.getByTestId('pagination')).toHaveTextContent('50');
  });

  it('next button is disabled on last page', () => {
    render(<Pagination page={5} limit={10} total={50} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});
