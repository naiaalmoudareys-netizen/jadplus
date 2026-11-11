/**
 * The maintenance company a property management team uses for its managed units (ADR 0034; A1): approved tenant
 * repairs go to it; "Normal routing" sends them to the maintenance service's own partner. Shared by the team's
 * office and JAD+ Admin (each with its own address); a viewer only reads.
 */
import { maintenanceSettingResponse } from '@jadplus/shared';
import { useState, type ReactNode } from 'react';
import { useAction } from '../ui/actions';
import { useConsole, useLoad } from '../ui/hooks';
import { Loaded, Notice, Section } from '../ui/parts';

export function MaintenanceCompany({ path, editable }: { path: string; editable: boolean }): ReactNode {
  const { api } = useConsole();
  const { state, reload } = useLoad(() => api.get(path, maintenanceSettingResponse), path);
  const [choice, setChoice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  return (
    <Section title="Maintenance company">
      <Loaded state={state} reload={reload}>
        {(s) => {
          const value = choice ?? s.partnerId ?? '';
          return (
            <div className="stack">
              <p className="hint">
                Approved tenant repairs on your managed units go to this company. Without one, they follow the
                normal maintenance routing.
              </p>
              <p>
                Now: <strong>{s.partnerName ?? 'Normal routing'}</strong>
              </p>
              {!editable ? null : (
                <div className="row-actions">
                  <label className="field">
                    <span className="label">Company</span>
                    <select
                      value={value}
                      disabled={action.busy}
                      onChange={(e) => {
                        setSaved(false);
                        setChoice(e.target.value);
                      }}
                    >
                      <option value="">Normal routing</option>
                      {s.choices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={action.busy || value === (s.partnerId ?? '')}
                    onClick={() => {
                      action.run(async () => {
                        await api.put(
                          path,
                          { partnerId: value === '' ? null : value },
                          maintenanceSettingResponse,
                        );
                        setChoice(null);
                        setSaved(true);
                        reload();
                      });
                    }}
                  >
                    {action.busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
              {saved ? <Notice tone="good">Saved.</Notice> : null}
              {action.error === null ? null : <Notice tone="bad">{action.error}</Notice>}
            </div>
          );
        }}
      </Loaded>
    </Section>
  );
}
