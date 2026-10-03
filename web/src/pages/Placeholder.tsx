import type { ReactNode } from 'react';

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section>
      <h1 className="page-title">{title}</h1>
      <div className="card">{children ?? <p className="muted">Скоро здесь будет экран.</p>}</div>
    </section>
  );
}
