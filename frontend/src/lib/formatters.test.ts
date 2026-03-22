import {
  formatNumber,
  formatDuration,
  formatPercentChange,
  formatRelativeTime,
  formatDate,
  formatChange,
} from '@/lib/formatters';

describe('formatNumber', () => {
  it('returns "892" for 892', () => {
    expect(formatNumber(892)).toBe('892');
  });

  it('returns "3.2K" for 3200', () => {
    expect(formatNumber(3200)).toBe('3.2K');
  });

  it('returns "12.5萬" for 125000', () => {
    expect(formatNumber(125000)).toBe('12.5萬');
  });

  it('returns "1.3億" for 130000000', () => {
    expect(formatNumber(130000000)).toBe('1.3億');
  });

  it('returns "3K" for 3000 (strips trailing .0)', () => {
    expect(formatNumber(3000)).toBe('3K');
  });
});

describe('formatDuration', () => {
  it('formats PT5M30S as 5:30', () => {
    expect(formatDuration('PT5M30S')).toBe('5:30');
  });

  it('formats PT1H23M45S as 1:23:45', () => {
    expect(formatDuration('PT1H23M45S')).toBe('1:23:45');
  });

  it('returns — for empty string', () => {
    expect(formatDuration('')).toBe('—');
  });

  it('formats PT45S as 0:45', () => {
    expect(formatDuration('PT45S')).toBe('0:45');
  });
});

describe('formatPercentChange', () => {
  it('returns +100.0% when doubled', () => {
    expect(formatPercentChange(200, 100)).toBe('+100.0%');
  });

  it('returns -50.0% when halved', () => {
    expect(formatPercentChange(50, 100)).toBe('-50.0%');
  });

  it('returns 0.0% when previous is 0', () => {
    expect(formatPercentChange(100, 0)).toBe('0.0%');
  });
});

describe('formatDate', () => {
  it('returns — for empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('formats a valid ISO date as YYYY-MM-DD', () => {
    expect(formatDate('2026-03-21T00:00:00.000Z')).toBe('2026-03-21');
  });
});

describe('formatChange', () => {
  it('returns green arrow up for positive change', () => {
    const result = formatChange(1200, 1000);
    expect(result.color).toBe('green');
    expect(result.arrow).toBe('↑');
  });

  it('returns red arrow down for negative change', () => {
    const result = formatChange(500, 1000);
    expect(result.color).toBe('red');
    expect(result.arrow).toBe('↓');
  });

  it('returns gray no-arrow for zero change', () => {
    const result = formatChange(1000, 1000);
    expect(result.color).toBe('gray');
    expect(result.arrow).toBe('');
    expect(result.text).toBe('0');
  });
});
