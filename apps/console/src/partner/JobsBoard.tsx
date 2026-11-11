/**
 * The partner office's jobs board (ADR 0023; R3, E4, S4): open jobs in "Needs you now", "Upcoming" and
 * "Waiting on the owner", each with its clock and technician. "Assign" chooses who goes, from the company's
 * active team only (C-AZ-2: the API checks it again).
 */
import {
  assignTechnicianBody,
  partnerJobsResponse,
  partnerTeamResponse,
  type PartnerJob,
  type PartnerTeam,
} from '@jadplus/shared';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { apiPath, errorMessage } from '../lib/api';
import { windowText } from '../lib/format';
import { groupJobs, jobClock, jobWhat, placeText } from '../lib/jobs';
import { technicianAssignedResponse } from '../lib/schemas';
import { useConsole, useLoad, useNow } from '../ui/hooks';
import { Link, Loaded, Notice, PageHeader, StatusTag, Tag } from '../ui/parts';
import { SnagsToFix } from './SnagsToFix';

type Technician = PartnerTeam['technicians'][number];

function Assign({
  job,
  team,
  onAssigned,
}: {
  job: PartnerJob;
  team: readonly Technician[];
  onAssigned: () => void;
}): ReactNode {
  const { api } = useConsole();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(job.technicianId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        disabled={team.length === 0}
        onClick={() => {
          setOpen(true);
        }}
      >
        {job.technicianId === null ? 'Assign' : 'Change'}
      </button>
    );
  }
  const save = (e: SyntheticEvent): void => {
    e.preventDefault();
    const body = assignTechnicianBody.safeParse({ technicianId: chosen });
    if (!body.success) {
      setError('Choose a technician.');
      return;
    }
    setBusy(true);
    setError(null);
    api.post(apiPath('partner', 'jobs', job.id, 'technician'), body.data, technicianAssignedResponse).then(
      () => {
        setBusy(false);
        setOpen(false);
        onAssigned();
      },
      (err: unknown) => {
        setBusy(false);
        setError(errorMessage(err));
      },
    );
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <label className="field">
        <span className="label">Who goes</span>
        <select
          value={chosen}
          onChange={(e) => {
            setChosen(e.target.value);
          }}
        >
          <option value="">Choose…</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {error === null ? null : <Notice tone="bad">{error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn" disabled={busy || chosen === ''}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function JobRow({
  job,
  reason,
  team,
  now,
  onAssigned,
}: {
  job: PartnerJob;
  reason: string | null;
  team: readonly Technician[];
  now: number;
  onAssigned: () => void;
}): ReactNode {
  const clock = jobClock(job, now);
  const technician =
    job.technicianId === null
      ? null
      : (team.find((t) => t.id === job.technicianId)?.name ?? 'No longer on the team');
  return (
    <li className="job">
      <div className="job-main">
        <p>
          <Link to={{ name: 'request', id: job.id }}>
            <span className="ref">{job.ref}</span> {jobWhat(job)}
          </Link>{' '}
          {job.emergency ? <Tag tone="bad">Emergency</Tag> : null}
        </p>
        <p className="muted">{placeText(job.location)}</p>
        <p>
          <StatusTag status={job.status} />
          {reason === null ? null : <span className="reason">{reason}</span>}
        </p>
        {clock === null ? null : <p className={clock.startsWith('Overdue') ? 'late' : 'muted'}>{clock}</p>}
        {job.arrivalWindow === null ? null : (
          <p className="muted">Arriving {windowText(job.arrivalWindow.start, job.arrivalWindow.end, now)}</p>
        )}
      </div>
      <div className="job-side">
        <p>
          <span className="label">Technician</span>
          <span className="block">{technician ?? 'Not chosen yet'}</span>
        </p>
        <Assign job={job} team={team} onAssigned={onAssigned} />
      </div>
    </li>
  );
}

export function JobsBoard(): ReactNode {
  const { api } = useConsole();
  const now = useNow();
  const { state, reload } = useLoad(
    () =>
      Promise.all([
        api.get('/api/partner/jobs', partnerJobsResponse),
        api.get('/api/partner/team', partnerTeamResponse),
      ]),
    'jobs',
  );
  return (
    <>
      <PageHeader eyebrow="Partner office" title="Jobs board">
        <button type="button" className="btn btn-outline" onClick={reload}>
          Refresh
        </button>
      </PageHeader>
      <SnagsToFix />
      <Loaded state={state} reload={reload}>
        {([{ jobs }, team]) => (
          <>
            {team.technicians.length === 0 ? (
              <Notice tone="warn">Add technicians on the Team page before assigning jobs.</Notice>
            ) : null}
            <div className="board">
              {groupJobs(jobs, now).map((g) => (
                <section key={g.column} className="card board-column">
                  <h2 className="section-title">
                    {g.title} <span className="count">{g.jobs.length}</span>
                  </h2>
                  {g.jobs.length === 0 ? (
                    <p className="muted">Nothing here.</p>
                  ) : (
                    <ul className="jobs">
                      {g.jobs.map(({ job, reason }) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          reason={reason}
                          team={team.technicians}
                          now={now}
                          onAssigned={reload}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
