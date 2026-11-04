import { render, screen } from '@testing-library/react';
import { Bar, BarChart } from 'recharts';
import { describe, expect, it } from 'vitest';
import { ChartContainer, type ChartConfig } from './chart';

const config = {
  cases: { label: 'Casos', color: 'var(--chart-1)' },
} satisfies ChartConfig;

describe('ChartContainer', () => {
  it('renderiza una serie y expone el aria-label que recibe', () => {
    render(
      <ChartContainer config={config} role="img" aria-label="Casos por semana">
        <BarChart data={[{ week: '2026-SE01', cases: 3 }]}>
          <Bar dataKey="cases" fill="var(--color-cases)" />
        </BarChart>
      </ChartContainer>,
    );

    const chart = screen.getByRole('img', { name: 'Casos por semana' });
    expect(chart.querySelector('style')?.textContent).toContain('--color-cases: var(--chart-1);');
  });
});
