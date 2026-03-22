import React from 'react';
import { render, screen } from '@testing-library/react';
import { TrendChart } from '@/components/TrendChart';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock;

describe('TrendChart', () => {
  const mockData = [
    { date: '2026-03-01', value: 1000 },
    { date: '2026-03-02', value: 1100 },
  ];

  it('renders without crashing with valid data', () => {
    render(
      <TrendChart
        data={mockData}
        timeRange="30D"
        onTimeRangeChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
  });

  it('renders with empty data array without crashing', () => {
    expect(() => {
      render(
        <TrendChart
          data={[]}
          timeRange="7D"
          onTimeRangeChange={vi.fn()}
        />
      );
    }).not.toThrow();
  });

  it('shows no-data message when data is empty', () => {
    render(
      <TrendChart
        data={[]}
        timeRange="7D"
        onTimeRangeChange={vi.fn()}
      />
    );
    expect(screen.getByText('尚無趨勢數據，等待明日第一次快照')).toBeInTheDocument();
  });

  it('renders time range selector buttons', () => {
    render(
      <TrendChart
        data={mockData}
        timeRange="30D"
        onTimeRangeChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('time-range-selector')).toBeInTheDocument();
  });
});
