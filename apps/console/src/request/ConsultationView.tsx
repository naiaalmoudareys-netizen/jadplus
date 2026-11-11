/**
 * JAD+ Admin's view of a consultation (ADR 0031, 0034; O5, P5): read-only. What the owner asked (answers, best
 * time to call), the consent they gave (wording, time, version, provider) and the stage timeline with the notes
 * the owner sees. The owner's contact details are not shown here (they live in the people pages, audited), and
 * no step can be taken: the provider office moves the stages. Nothing is shown for other services.
 */
import { consultationResponse, consultationTimeline, type ConsultationView as View } from '@jadplus/shared';
import type { ReactNode } from 'react';
import { apiPath } from '../lib/api';
import { answerLines, bestTimeText, consentLine, stepName } from '../lib/consultation';
import { dateTime } from '../lib/format';
import { useConsole, useLoad } from '../ui/hooks';
import { Fact, Loaded } from '../ui/parts';

const STATE_TEXT: Readonly<Record<string, string>> = {
  done: 'Done',
  current: 'Now',
  next: 'Next',
  not_reached: 'Not reached',
};

function Stages({ v }: { v: View }): ReactNode {
  return (
    <ol className="stack" aria-label="Stages">
      {consultationTimeline(v.serviceCode, v.status, v.steps).map((item) => (
        <li key={item.id} aria-current={item.state === 'current' ? 'step' : undefined}>
          <strong>{stepName(v.serviceCode, item.id)}</strong> · {STATE_TEXT[item.state] ?? item.state}
          {item.at === null ? null : ` · ${dateTime(item.at)}`}
          {item.note === null ? null : <div className="muted">Note to the owner: {item.note}</div>}
        </li>
      ))}
    </ol>
  );
}

export function ConsultationView({ requestId }: { requestId: string }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(
    () => api.get(apiPath('requests', requestId, 'consultation'), consultationResponse),
    `consultation-${requestId}`,
  );
  return (
    <Loaded state={state} reload={reload}>
      {({ consultation: v }) =>
        v === null ? null : (
          <section className="card stack">
            <h2 className="section-title">Consultation</h2>
            <dl className="facts">
              {answerLines(v).map((a) => (
                <Fact key={a.question} label={a.question}>
                  {a.answer}
                </Fact>
              ))}
              <Fact label="Best time to call">{bestTimeText(v)}</Fact>
              <Fact label="Consent">{consentLine(v)}</Fact>
            </dl>
            <h3 className="label">Stages</h3>
            <Stages v={v} />
          </section>
        )
      }
    </Loaded>
  );
}
