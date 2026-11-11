/**
 * The console's menu icons (ADR 0036): one thin line drawing per kind of page, in the current text colour, so
 * every menu reads the same. Decorative only: the label next to each icon is what screen readers announce.
 */
import type { ReactNode } from 'react';
import type { IconName } from '../lib/nav';

/** SVG path data on a 24 x 24 grid, drawn with a 1.6 stroke. */
const PATHS: Readonly<Record<IconName, string>> = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  attention: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  requests: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  desk: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
  handover: 'M8 14a4 4 0 1 1 3-6.6L20 7v3h-2v2h-2v2h-3.4A4 4 0 0 1 8 14z',
  education: 'M3 9l9-4 9 4-9 4zM7 11v5c3 2 7 2 10 0v-5',
  people:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2.5 3 5',
  building: 'M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18',
  offer: 'M4 12V4h8l8 8-8 8zM8 8h.5',
  partner: 'M3 12l4-4 5 3 5-3 4 4-9 7zM7 8l5-3 5 3',
  service: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M11 16v4',
  invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  oncall: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  report: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  audit: 'M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6zM9 12l2 2 4-4',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  dispatch: 'M3 20l6-16 3 7 9 3zM12 11l9 3',
  jobs: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  consultation: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  inspection: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15 15l6 6M7 10l2 2 4-4',
  snag: 'M4 20h16M6 20l3-9h6l3 9M9 11l1-5h4l1 5M12 14v3',
  quote: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4M15 16h.5',
  message: 'M4 5h16v11H8l-4 4zM8 10h.5M12 10h.5M16 10h.5',
  unit: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  team: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
  performance: 'M4 18l5-6 4 3 7-9M15 6h5v5',
  night: 'M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10z',
  document: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13l2 2 4-4',
  rate: 'M5 4h14v16H5zM9 8h6M9 12h2M13 12h2M9 16h2M13 16h2',
};

export function Icon({ name }: { name: IconName }): ReactNode {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
