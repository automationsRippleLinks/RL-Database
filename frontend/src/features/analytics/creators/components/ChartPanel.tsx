import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ChartPanel({ title, subtitle, children }: Props) {
  return (
    <article className="cc-panel">
      <div className="cc-ph">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>

      </div>
      {children}
    </article>
  );
}

export const EmptyChart = ({ message = 'No creators match these filters.' }: { message?: string }) => <p className="cc-empty" data-testid="empty-chart">{message}</p>;
