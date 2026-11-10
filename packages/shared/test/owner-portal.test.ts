/** Owner app rules: R1/O1 payment plan, N1/N3 news & offers, data minimisation of the Salesforce answer. */
import { describe, expect, it } from 'vitest';
import { isOffer, newsFeed, offerCount, postVisible } from '../src/news.js';
import { instalmentState, planSummary, type Instalment } from '../src/payments.js';
import { fromSalesforce, salesforceOwnerAnswer } from '../src/portal.js';

const TODAY = '2026-11-10';
const inst = (over: Partial<Instalment>): Instalment => ({
  name: '2nd Instalment',
  seq: 2,
  amount: 100_000,
  paid: 0,
  due: '2027-03-01',
  description: null,
  ...over,
});

describe('payment plan (R1, O1)', () => {
  it('O1: paid, overdue, due soon, part paid, upcoming and on completion, like the prototype', () => {
    expect(instalmentState(inst({ paid: 99_999.5 }), TODAY)).toEqual({
      kind: 'paid',
      label: 'Paid',
      balance: 0,
    });
    expect(instalmentState(inst({ due: '2026-11-01' }), TODAY)).toMatchObject({
      kind: 'overdue',
      label: 'Overdue 9 days',
    });
    expect(instalmentState(inst({ due: '2026-11-09' }), TODAY).label).toBe('Overdue 1 day');
    expect(instalmentState(inst({ due: TODAY }), TODAY).label).toBe('Due today');
    expect(instalmentState(inst({ due: '2026-12-10' }), TODAY)).toMatchObject({
      kind: 'soon',
      label: 'Due in 30 days',
    });
    expect(instalmentState(inst({ paid: 20_000 }), TODAY)).toMatchObject({ kind: 'part', balance: 80_000 });
    expect(instalmentState(inst({}), TODAY).kind).toBe('upcoming');
    expect(instalmentState(inst({ name: 'On Completion', due: null }), TODAY).label).toBe('On completion');
    expect(instalmentState(inst({ due: null }), TODAY).label).toBe('Scheduled');
  });

  it('R1: totals, percentage paid, overdue amount and the next payment', () => {
    const plan = [
      inst({ name: 'Down payment', seq: 1, paid: 100_000, due: '2026-01-01' }),
      inst({ name: '1st Instalment', seq: 2, due: '2026-11-01' }),
      inst({ name: '2nd Instalment', seq: 3, due: '2026-12-01' }),
      inst({ name: 'On Completion', seq: 4, amount: 200_000, due: null }),
    ];
    const s = planSummary(plan, 0, TODAY);
    expect(s.total).toBe(500_000);
    expect(s.paid).toBe(100_000);
    expect(s.percentPaid).toBe(20);
    expect(s.overdueAmount).toBe(100_000);
    expect(s.overdue.map((x) => x.instalment.name)).toEqual(['1st Instalment']);
    expect(s.next?.instalment.name).toBe('2nd Instalment');
  });

  it('R1: with no plan on file the price is the total', () => {
    expect(planSummary([], 1_250_000, TODAY)).toMatchObject({ total: 1_250_000, paid: 0, next: null });
  });
});

describe('news and exclusive offers (N1, N3)', () => {
  const post = (
    id: string,
    over: Partial<{ type: string; pinned: boolean; date: string; expires: string | null }>,
  ) => ({
    id,
    type: 'News',
    pinned: false,
    date: '2026-11-01',
    expires: null,
    ...over,
  });
  const posts = [
    post('old', { date: '2026-03-05' }),
    post('new', { date: '2026-11-09' }),
    post('pinned', { date: '2026-07-01', pinned: true }),
    post('offer', { type: 'Exclusive offer', date: '2026-11-08', expires: '2026-12-01' }),
    post('expired', { type: 'Exclusive offer', expires: '2026-11-09' }),
    post('future', { date: '2026-11-20' }),
  ];

  it('N3: shown from the publish date through the expiry date only', () => {
    expect(postVisible(post('x', { date: TODAY, expires: TODAY }), TODAY)).toBe(true);
    expect(postVisible(post('x', { expires: '2026-11-09' }), TODAY)).toBe(false);
    expect(postVisible(post('x', { date: '2026-11-11' }), TODAY)).toBe(false);
  });

  it('N1: pinned first, then newest first; filters for news and offers with the offer count', () => {
    expect(newsFeed(posts, 'all', TODAY).map((p) => p.id)).toEqual(['pinned', 'new', 'offer', 'old']);
    expect(newsFeed(posts, 'news', TODAY).map((p) => p.id)).toEqual(['pinned', 'new', 'old']);
    expect(newsFeed(posts, 'offers', TODAY).map((p) => p.id)).toEqual(['offer']);
    expect(offerCount(posts, TODAY)).toBe(1);
    expect(isOffer({ type: 'Exclusive offer' })).toBe(true);
  });
});

describe('Salesforce answer to the owner app', () => {
  const raw = {
    generated_at: '2026-11-10T08:00:00Z',
    person: {
      name: 'Layla Haddad',
      first_name: 'Layla',
      email: 'layla.haddad@example.com',
      mobile: '+971 50 000 0000',
      nationality: 'Sample',
    },
    documents: [
      { name: 'Passport', file: '068000000000002AAA', added: '2025-12-01', notes: 'desk-only-note' },
      { name: 'Visa', file: '../../etc/passwd' },
    ],
    requests: [{ id: 'a0Y', details: 'Please update my passport' }],
    deals: [
      {
        id: '006000000000001AAA',
        ref: 'DEMO-J188-1204',
        stage: 'Sold',
        role: 'Buyer',
        price: 2_450_000,
        discount: null,
        unit: {
          name: '1204-J188',
          bedrooms: 2,
          total_area: 1266.8,
          project: 'J188',
          completion: '30-06-2028',
        },
        instalments: [{ name: 'Down Payment', seq: 1, amount: 245_000, paid: 245_000, due: '2025-12-25' }],
        charges: [],
        receipts: [{ id: null, name: 'R-1' }],
        penalties: [],
      },
    ],
    updates: [
      {
        id: 'a1Pu',
        title: 'Level 12',
        photos: ['068000000000001AAA', '../../etc/passwd', 42, 'demo-photo-j188'],
      },
    ],
    posts: [
      {
        id: 'p1',
        type: 'News',
        title: 'Groundbreaking',
        date: '2026-07-13',
        pinned: false,
        link: 'javascript:alert(1)',
      },
      { id: 'p2', type: 'News', title: 'Launch', date: null, link: 'https://jadglobal.ae/' },
    ],
  };

  it('O1: construction photos keep only real file ids (anything else is dropped)', () => {
    const out = fromSalesforce(salesforceOwnerAnswer.parse(raw), 'https://pay.jadglobal.ae/', TODAY);
    expect(out.updates[0]?.photos).toEqual(['068000000000001AAA', 'demo-photo-j188']);
    expect(out.posts[0]?.photos).toEqual([]);
  });

  it('C-PD-1: identity documents are listed by name and file id only; nationality and desk requests never reach the app', () => {
    const out = fromSalesforce(salesforceOwnerAnswer.parse(raw), 'https://pay.jadglobal.ae/', TODAY);
    expect(out.documents).toEqual([{ name: 'Passport', fileId: '068000000000002AAA', added: '2025-12-01' }]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/nationality|Sample|a0Y|desk-only-note|passwd/);
    expect(out.person).toEqual({
      name: 'Layla Haddad',
      firstName: 'Layla',
      email: 'layla.haddad@example.com',
      mobile: '+971 50 000 0000',
    });
  });

  it('C-VAL-1: odd values become empty instead of breaking the app; only https links pass', () => {
    const out = fromSalesforce(salesforceOwnerAnswer.parse(raw), 'https://pay.jadglobal.ae/', TODAY);
    const [deal] = out.deals;
    expect(deal?.discount).toBe(0);
    expect(deal?.unit?.bedrooms).toBe('2');
    expect(deal?.receipts).toEqual([]);
    expect(out.posts.map((p) => [p.id, p.link, p.date])).toEqual([
      ['p1', null, '2026-07-13'],
      ['p2', 'https://jadglobal.ae/', TODAY],
    ]);
  });
});
