import type { ReactNode } from 'react';

export function DemoCard({
  title,
  description,
  children,
  code,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  code?: string;
}) {
  return (
    <section className="rounded-lg border border-token surface p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm muted-text">{description}</p> : null}
      </header>
      {children ? <div className="py-3">{children}</div> : null}
      {code ? (
        <pre className="mt-3">
          <code>{code}</code>
        </pre>
      ) : null}
    </section>
  );
}

export function PageHeader({
  title,
  lead,
}: {
  title: string;
  lead: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 muted-text">{lead}</p>
    </div>
  );
}
