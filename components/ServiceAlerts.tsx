'use client';

import { useEffect, useState } from 'react';
import { ServiceAlert } from '@/lib/types';

interface ServiceAlertsProps {
  onSampleChange?: (isSample: boolean) => void;
}

const RANK = { critical: 3, warning: 2, info: 1 } as const;

/** Service alerts as one compact bar that expands to the full list. */
export default function ServiceAlerts({ onSampleChange }: ServiceAlertsProps) {
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/alerts');
        if (response.ok) {
          const data = await response.json();
          setAlerts(data.alerts || []);
          onSampleChange?.(Boolean(data.isMockData));
        }
      } catch (error) {
        console.error('Error fetching alerts:', error);
      }
    };

    fetchAlerts();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 300000);
    return () => clearInterval(interval);
  }, [onSampleChange]);

  if (alerts.length === 0) {
    return null;
  }

  const sorted = [...alerts].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const top = sorted[0];

  return (
    <details className="alerts">
      <summary>
        <span className={`sev ${top.severity}`}>{top.severity === 'critical' ? 'Critical' : top.severity === 'warning' ? 'Warning' : 'Info'}</span>
        <span className="first">
          {alerts.length === 1 ? top.title : `${alerts.length} service alerts · ${top.title}`}
        </span>
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="2.2" fill="none" />
        </svg>
      </summary>
      <ul>
        {sorted.map((alert) => (
          <li key={alert.id}>
            <h3>
              <span className={`sev ${alert.severity}`}>{alert.severity}</span>
              {alert.title}
            </h3>
            {alert.description && alert.description !== alert.title && <p>{alert.description}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
