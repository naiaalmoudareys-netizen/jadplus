/**
 * Demo owner data for the owner app until Salesforce is connected (ADR 0010), ported from the prototype's demo
 * owner (portal-live src/demo.js). Fictional person and units; dates move with today so the payment statuses
 * (paid, due soon, overdue, upcoming) always look real. The app labels it "Demo data".
 */
import { PAY_URL, type OwnerPortal } from '@jadplus/shared';

const DAY_MS = 86_400_000;

function plan(
  price: number,
  rows: readonly (readonly [string, number, number | null, boolean])[],
  day: (n: number) => string,
) {
  return rows.map(([name, pct, offset, paid], k) => ({
    name,
    seq: k + 1,
    amount: (price * pct) / 100,
    paid: paid ? (price * pct) / 100 : 0,
    due: offset === null ? null : day(offset),
    description: offset === null ? 'On completion' : null,
  }));
}

function receipts(instalments: ReturnType<typeof plan>, prefix: string) {
  return instalments
    .filter((i) => i.paid > 0)
    .map((i, k) => ({
      id: `${prefix}${String(k + 1)}`,
      name: `DEMO-R-${String(1001 + k)}`,
      for: i.name,
      amount: i.paid,
      paidOn: i.due,
      method: 'Bank Transfer',
      fileId: `demo-doc-receipt-${prefix.toLowerCase()}-${String(k + 1)}`,
    }));
}

export function demoOwnerPortal(now: number): OwnerPortal {
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const day = (n: number) => new Date(today + n * DAY_MS).toISOString().slice(0, 10);
  const j188 = plan(
    2_450_000,
    [
      ['Down Payment Instalment', 10, -320, true],
      ['1st Instalment', 10, -140, true],
      ['2nd Instalment', 10, 12, false],
      ['3rd Instalment', 10, 132, false],
      ['4th Instalment', 10, 252, false],
      ['On Completion', 50, null, false],
    ],
    day,
  );
  const jad288 = plan(
    1_380_000,
    [
      ['Down Payment Instalment', 10, -60, true],
      ['1st Instalment', 10, -9, false],
      ['2nd Instalment', 10, 111, false],
      ['On Completion', 70, null, false],
    ],
    day,
  );
  const unit = (over: Partial<NonNullable<OwnerPortal['deals'][number]['unit']>> & { name: string }) => ({
    number: null,
    type: null,
    bedrooms: null,
    bathrooms: null,
    floor: null,
    building: null,
    internalArea: null,
    balconyArea: null,
    totalArea: null,
    view: null,
    parking: null,
    project: null,
    completion: null,
    address: null,
    planFileId: null,
    ...over,
  });
  return {
    source: 'demo',
    person: {
      name: 'Layla Haddad',
      firstName: 'Layla',
      email: 'layla.haddad@example.com',
      mobile: '+971 50 000 0000',
    },
    deals: [
      {
        id: 'DEMODEAL0000000001',
        ref: 'DEMO-J188-1204',
        stage: 'Sold',
        role: 'Buyer',
        price: 2_450_000,
        discount: 0,
        unit: unit({
          name: '1204-J188',
          number: '1204',
          type: '2 Bedroom',
          bedrooms: '2',
          bathrooms: 3,
          floor: '12',
          internalArea: 1104.5,
          balconyArea: 162.3,
          totalArea: 1266.8,
          view: 'Creek view',
          parking: 1,
          project: 'J188',
          completion: '30-06-2028',
          address: 'Al Jaddaf, Dubai',
          planFileId: 'demo-plan-j188',
        }),
        instalments: j188,
        charges: [{ name: 'DLD Registration Fee', amount: 98_000, paid: 98_000, due: day(-320) }],
        receipts: receipts(j188, 'DEMORCPTA'),
        penalties: [],
      },
      {
        id: 'DEMODEAL0000000002',
        ref: 'DEMO-JAD288-C-506',
        stage: 'Booked',
        role: 'Buyer',
        price: 1_380_000,
        discount: 25_000,
        unit: unit({
          name: '506-JAD288-C',
          number: '506',
          type: '1 Bedroom',
          bedrooms: '1',
          bathrooms: 2,
          floor: '5',
          building: 'Block C',
          internalArea: 610.2,
          balconyArea: 88.4,
          totalArea: 698.6,
          view: 'Garden view',
          parking: 1,
          project: 'JAD 288',
          completion: '31-03-2028',
          address: 'Jumeirah Garden City, Dubai',
          planFileId: 'demo-plan-jad288',
        }),
        instalments: jad288,
        charges: [{ name: 'DLD Registration Fee', amount: 55_200, paid: 55_200, due: day(-60) }],
        receipts: receipts(jad288, 'DEMORCPTB'),
        penalties: [],
      },
    ],
    documents: [
      { name: 'Passport', fileId: 'demo-doc-passport', added: day(-330) },
      { name: 'Emirates ID', fileId: 'demo-doc-emirates-id', added: day(-330) },
    ],
    updates: [
      {
        id: 'demo-u1',
        title: 'Level 12 slab completed',
        date: day(-6),
        percent: 34,
        stage: 'Structure',
        details: 'The structure has reached level 12. Facade mock-up panels are on site for review.',
        handover: null,
        project: 'J188',
        building: null,
        photos: ['demo-photo-j188'],
      },
      {
        id: 'demo-u2',
        title: 'Block C basement under way',
        date: day(-12),
        percent: 14,
        stage: 'Foundation',
        details: 'Excavation is complete and the basement works for Block C are progressing.',
        handover: null,
        project: 'JAD 288',
        building: 'Block C',
        photos: ['demo-photo-jad288'],
      },
      {
        id: 'demo-u3',
        title: 'Foundations complete',
        date: day(-75),
        percent: 18,
        stage: 'Foundation',
        details: 'Raft foundations are complete and the first basement level is in progress.',
        handover: null,
        project: 'J188',
        building: null,
        photos: [],
      },
    ],
    posts: [
      {
        id: 'demo-p1',
        type: 'Exclusive offer',
        title: 'An owners-only residence at J188',
        summary: 'Reserved first for JAD+ owners: a two-bedroom residence with open creek views.',
        body: 'Before it reaches the wider market, this residence is offered to JAD+ owners first. Tap "I\'m interested" and the JAD+ desk will arrange a private viewing of the plans.',
        date: day(-2),
        pinned: true,
        expires: day(26),
        link: null,
        project: 'J188',
        photos: ['demo-photo-j188'],
        offer: {
          unitName: '905-J188',
          type: '2 Bedroom',
          bedrooms: '2',
          totalArea: 1241.2,
          floor: '9',
          view: 'Creek view',
          project: 'J188',
          price: 2_390_000,
          offerPrice: 2_290_000,
        },
      },
      {
        id: 'demo-p2',
        type: 'Event',
        title: 'Demo news: an evening for JAD+ owners',
        summary: 'A sample news item to preview the layout. Not a real event.',
        body: 'This is a sample news item. Real news is published by JAD Global in Salesforce.',
        date: day(-1),
        pinned: false,
        expires: null,
        link: null,
        project: null,
        offer: null,
        photos: ['demo-photo-jad288'],
      },
      {
        id: 'demo-p3',
        type: 'News',
        title: 'Construction progress at JAD 288',
        summary: 'A sample update on the JAD 288 site in Jumeirah Garden City.',
        body: 'This is a sample news item about JAD 288. Real news is published by JAD Global in Salesforce.',
        date: day(-30),
        pinned: false,
        expires: null,
        link: 'https://jadglobal.ae/',
        project: 'JAD 288',
        offer: null,
        photos: ['demo-photo-jad288'],
      },
    ],
    payUrl: PAY_URL,
  };
}
