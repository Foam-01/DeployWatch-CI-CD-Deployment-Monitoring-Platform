import type { CSSProperties } from 'react';
import type { DashboardAnalyticsPoint } from '@/types/api';

interface TrendChartProps {
  title: string;
  points: DashboardAnalyticsPoint[];
  periodDays: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function TrendChart({ title, points, periodDays }: TrendChartProps) {
  const chartId = title.toLowerCase().replace(/\s+/g, '-');
  const totals = points.map((point) => point.successes + point.failures);
  const maxValue = Math.max(...totals, 1);
  const successes = points.reduce((sum, point) => sum + point.successes, 0);
  const failures = points.reduce((sum, point) => sum + point.failures, 0);
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <section className="card trend-card" aria-labelledby={`${chartId}-trend-heading`}>
      <div className="card-head">
        <h3 id={`${chartId}-trend-heading`}>{title}</h3>
        <span className="muted small">{successes + failures} total</span>
      </div>
      {successes + failures === 0 ? (
        <p className="muted small trend-empty">No completed activity in this period.</p>
      ) : (
        <>
          <div className="trend-legend" aria-hidden="true">
            <span><i className="trend-swatch trend-swatch-success" />Successful</span>
            <span><i className="trend-swatch trend-swatch-failure" />Failed</span>
          </div>
          <div
            className="trend-chart"
            role="img"
            aria-label={`${title}, last ${periodDays} days`}
            aria-describedby={`${chartId}-trend-description`}
            style={{ '--trend-columns': points.length } as CSSProperties}
          >
            {points.map((point, index) => (
              <div className="trend-bar-column" key={point.date} aria-hidden="true">
                <div
                  className="trend-bar-stack"
                  title={`${point.date}: ${point.successes} successful, ${point.failures} failed`}
                >
                  <span
                    className="trend-bar trend-bar-success"
                    style={{ height: `${(point.successes / maxValue) * 100}%` }}
                  />
                  <span
                    className="trend-bar trend-bar-failure"
                    style={{ height: `${(point.failures / maxValue) * 100}%` }}
                  />
                </div>
                {(index % labelEvery === 0 || index === points.length - 1) && (
                  <span className="trend-date" title={point.date}>
                    {dateFormatter.format(new Date(`${point.date}T00:00:00Z`))}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="sr-only" id={`${chartId}-trend-description`}>
            {successes} successful and {failures} failed {title.toLowerCase()}.
          </p>
          <table className="sr-only">
            <caption>
              {title} by day over the last {periodDays} days
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Successful</th>
                <th scope="col">Failed</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{point.date}</th>
                  <td>{point.successes}</td>
                  <td>{point.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
