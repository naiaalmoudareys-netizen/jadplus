/**
 * "Consultations" (ADR 0031, 0036; O5, P5, S4): the pipeline of each consultation service the office handles,
 * from New (the first call is owed, with its deadline) through Contact made and the service's stages to Done or
 * Did not proceed. Each card opens the request, where the office records the next step and, with the owner's
 * consent, opens their contact details (audited). Finished consultations stay here for 30 days.
 */
import { partnerConsultationsResponse, type PartnerConsultation } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { firstCallText, pipelines, unitLine, type Pipeline } from '../lib/boards';
import { ago } from '../lib/format';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Empty, Link, Loaded, PageHeader, Tag } from '../ui/parts';

function Card({ item, now }: { item: PartnerConsultation; now: number }): ReactNode {
  const call = firstCallText(item, now);
  return (
    <li className="pipeline-card">
      <Link to={{ name: 'request', id: item.id }}>
        <span className="ref">{item.ref}</span>
      </Link>
      <p className="muted">{unitLine(item)}</p>
      {call === null ? null : <Tag tone={call.tone}>{call.text}</Tag>}
      <p className="hint">
        {item.lastStepAt === null
          ? `Asked ${ago(item.createdAt, now)}`
          : `Last step ${ago(item.lastStepAt, now)}`}
      </p>
    </li>
  );
}

function Board({ pipeline, now }: { pipeline: Pipeline; now: number }): ReactNode {
  return (
    <section className="card">
      <h2 className="section-title">{pipeline.serviceName}</h2>
      <div className="pipeline" role="list" aria-label={`${pipeline.serviceName} pipeline`}>
        {pipeline.columns.map((col) => (
          <div key={col.id} className="pipeline-column" role="listitem">
            <p className="label">
              {col.label} <span className="count">{col.items.length}</span>
            </p>
            {col.items.length === 0 ? null : (
              <ul className="plain pipeline-cards">
                {col.items.map((i) => (
                  <Card key={i.id} item={i} now={now} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Consultations(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () => api.get('/api/partner/consultations', partnerConsultationsResponse),
    'consultations',
  );
  return (
    <>
      <PageHeader title="Consultations">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <Loaded state={state} reload={reload}>
        {({ consultations }) =>
          consultations.length === 0 ? (
            <section className="card">
              <Empty explain="When an owner asks for one of your consultation services, it appears here as New, with the deadline for your first call.">
                No consultations yet.
              </Empty>
            </section>
          ) : (
            pipelines(consultations).map((p) => <Board key={p.serviceCode} pipeline={p} now={now} />)
          )
        }
      </Loaded>
    </>
  );
}
