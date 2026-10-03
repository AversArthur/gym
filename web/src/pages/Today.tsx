import { useEffect, useState } from 'react';
import { DAY_CODES, type HealthResponse } from '@gym/shared';
import { Placeholder } from './Placeholder';

export function TodayPage() {
  const [api, setApi] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((d) => setApi(d.ok ? 'ok' : 'error'))
      .catch(() => setApi('error'));
  }, []);

  return (
    <Placeholder title="Сегодня">
      <div className="day-pills">
        {DAY_CODES.map((d) => (
          <span key={d} className={`day-pill day-${d}`}>
            {d}
          </span>
        ))}
      </div>
      <p className="muted mono">
        API: {api === 'loading' ? '…' : api === 'ok' ? 'на связи' : 'недоступен'}
      </p>
    </Placeholder>
  );
}
