/**
 * The demo company's cast. Every person is fictional (CLAUDE.md "People"): names are invented, emails use
 * example.com (residents) or demo addresses at jadplus.ae (staff), and mobile numbers follow the
 * +971 50 000 0xxx pattern. Units are fictional Salesforce records in the two demo projects the owner app knows
 * (J188 in Al Jaddaf; JAD 288, Blocks A-C, in Jumeirah Garden City).
 */

export interface DemoUnit {
  readonly id: string;
  readonly dealId: string;
  readonly name: string;
  readonly project: 'J188' | 'JAD 288';
  readonly building: string | null;
  readonly address: string;
}

export interface DemoPerson {
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

export interface DemoOwner extends DemoPerson {
  readonly units: readonly DemoUnit[];
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

function unit(n: number, name: string, project: DemoUnit['project'], building: string | null): DemoUnit {
  return {
    id: `a0XDEMO${pad(n, 10)}A`,
    dealId: `006DEMO${pad(n, 10)}A`,
    name,
    project,
    building,
    address: project === 'J188' ? 'Al Jaddaf, Dubai' : 'Jumeirah Garden City, Dubai',
  };
}

/** The base demo owner's two units, as in the base seed and the demo owner portal (src/portal/demo.ts). */
export const LAYLA_UNITS: readonly DemoUnit[] = [
  unit(1, '1204-J188', 'J188', null),
  unit(2, '506-JAD288-C', 'JAD 288', 'Block C'),
];

/** 56 more units: J188 floors 3-18, JAD 288 Blocks A, B and C. */
function moreUnits(): DemoUnit[] {
  const units: DemoUnit[] = [];
  let n = 3;
  for (let floor = 3; floor <= 16; floor += 1) {
    for (const apt of [2, 7]) units.push(unit(n++, `${String(floor)}${pad(apt, 2)}-J188`, 'J188', null));
  }
  for (const block of ['A', 'B', 'C'] as const) {
    for (let floor = 1; floor <= 9; floor += 1) {
      const apt = floor % 2 === 0 ? 3 : 8;
      if (block === 'C' && floor === 5) continue;
      units.push(unit(n++, `${String(floor)}${pad(apt, 2)}-JAD288-${block}`, 'JAD 288', `Block ${block}`));
    }
  }
  return units;
}

export const UNITS: readonly DemoUnit[] = moreUnits();

const OWNER_NAMES = [
  'Omar Al Mansoori',
  'Priya Raman',
  'James Whitfield',
  'Elena Petrova',
  'Chen Wei',
  'Fatima Zahra Idrissi',
  'Rahul Mehta',
  'Sophie Laurent',
  'Khalid Al Suwaidi',
  'Anastasia Volkova',
  'Daniel Okafor',
  'Mariam Haddad',
  'Lucas Fernandes',
  'Aisha Rahman',
  'Hiroshi Tanaka',
  'Grace Mwangi',
  'Youssef Benali',
  'Hannah Becker',
  'Arjun Nair',
  'Noor Al Hashimi',
  'Mateo Rossi',
  'Leila Karimi',
  'Oliver Grant',
  'Sara Lindqvist',
  'Hamza Qureshi',
  'Isabella Costa',
  'Dmitri Sokolov',
  'Amira Saleh',
  'Ethan Brooks',
  'Mei Lin Tan',
  'Tariq Hussain',
  'Camille Dubois',
  'Vikram Iyer',
  'Nadia Farouk',
  'William Hayes',
  'Zainab Malik',
  'Ivan Morozov',
  'Lina Abboud',
  'Samuel Adeyemi',
] as const;

const TENANT_NAMES = [
  'Rania Khoury',
  'Marco Bianchi',
  'Ayesha Siddiqui',
  'Tom Gallagher',
  'Yara Nassar',
  'Kenji Sato',
  'Bilal Chaudhry',
  'Clara Novak',
  'Hassan Darwish',
  'Ella Johansson',
  'Ravi Kapoor',
  'Salma Odeh',
  'Victor Lemaire',
  'Dana Aziz',
] as const;

const emailFor = (name: string): string =>
  `${name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)
    .join('.')}@example.com`;

/** Owners: Layla Haddad (the base demo owner) first, then 39 more; every fifth has a second unit. */
export function owners(): DemoOwner[] {
  const list: DemoOwner[] = [
    {
      key: 'layla',
      name: 'Layla Haddad',
      email: 'layla.haddad@example.com',
      phone: '+971500000100',
      units: LAYLA_UNITS,
    },
  ];
  let u = 0;
  OWNER_NAMES.forEach((name, i) => {
    const count = i % 5 === 2 ? 2 : 1;
    const mine = UNITS.slice(u, u + count);
    u += count;
    list.push({
      key: `owner${pad(i + 1, 2)}`,
      name,
      email: emailFor(name),
      phone: `+97150000${pad(101 + i, 4)}`,
      units: mine,
    });
  });
  return list;
}

export function tenants(): DemoPerson[] {
  return TENANT_NAMES.map((name, i) => ({
    key: `tenant${pad(i + 1, 2)}`,
    name,
    email: emailFor(name),
    phone: `+97150000${pad(301 + i, 4)}`,
  }));
}

export interface DemoProvider {
  /** Fixed id for the base seed's providers; new ones get theirs from the API. */
  readonly key: string;
  readonly name: string;
  readonly kind: 'external' | 'jad_group';
  readonly services: readonly (readonly [string, 'primary' | 'backup'])[];
  readonly office: DemoPerson;
  readonly staff: readonly DemoPerson[];
}

const staff = (key: string, name: string, email: string, n: number): DemoPerson => ({
  key,
  name,
  email,
  phone: `+97150000${pad(500 + n, 4)}`,
});

/** Outside partners added by JAD+ Admin through the console (the base seed's three providers are kept). */
export const NEW_PARTNERS: readonly DemoProvider[] = [
  {
    key: 'gulf',
    name: 'Gulf Shield Maintenance (demo)',
    kind: 'external',
    services: [['maintenance', 'backup']],
    office: staff('gulf-office', 'Gulf Shield Office Demo', 'office.gulf.demo@jadplus.ae', 1),
    staff: [
      staff('gulf-t1', 'Ravi Shankar (demo)', 'tech.gulf.ravi.demo@jadplus.ae', 2),
      staff('gulf-t2', 'Joseph Mendes (demo)', 'tech.gulf.joseph.demo@jadplus.ae', 3),
    ],
  },
  {
    key: 'precision',
    name: 'Precision Snagging (demo)',
    kind: 'external',
    services: [['snagging', 'primary']],
    office: staff('precision-office', 'Precision Office Demo', 'office.precision.demo@jadplus.ae', 4),
    staff: [staff('precision-t1', 'Nikhil Varma (demo)', 'inspector.precision.demo@jadplus.ae', 5)],
  },
  {
    key: 'casa',
    name: 'Casa Interiors (demo)',
    kind: 'external',
    services: [['furnishing', 'primary']],
    office: staff('casa-office', 'Casa Interiors Office Demo', 'office.casa.demo@jadplus.ae', 6),
    staff: [staff('casa-t1', 'Marta Silva (demo)', 'team.casa.demo@jadplus.ae', 7)],
  },
  {
    key: 'atelier',
    name: 'Atelier Nine Design (demo)',
    kind: 'external',
    services: [['interior-design', 'primary']],
    office: staff('atelier-office', 'Atelier Nine Office Demo', 'office.atelier.demo@jadplus.ae', 8),
    staff: [staff('atelier-t1', 'Lea Moreau (demo)', 'designer.atelier.demo@jadplus.ae', 9)],
  },
  {
    key: 'residency',
    name: 'Residency Desk (demo)',
    kind: 'external',
    services: [['golden-visa', 'primary']],
    office: staff('residency-office', 'Residency Desk Office Demo', 'office.residency.demo@jadplus.ae', 10),
    staff: [staff('residency-t1', 'Imran Sheikh (demo)', 'advisor.residency.demo@jadplus.ae', 11)],
  },
  {
    key: 'crescent',
    name: 'Crescent Home Finance (demo)',
    kind: 'external',
    services: [['mortgage', 'primary']],
    office: staff('crescent-office', 'Crescent Finance Office Demo', 'office.crescent.demo@jadplus.ae', 12),
    staff: [staff('crescent-t1', 'Hana Yousef (demo)', 'advisor.crescent.demo@jadplus.ae', 13)],
  },
];

/** Extra team members for the base seed's providers (added by each office through the console). */
export const EXTRA_STAFF: Readonly<Record<string, readonly DemoPerson[]>> = {
  'demo-partner': [
    staff('fixers-t2', 'Arun Pillai (demo)', 'tech.fixers.arun.demo@jadplus.ae', 20),
    staff('fixers-t3', 'Mohammed Rafiq (demo)', 'tech.fixers.rafiq.demo@jadplus.ae', 21),
    staff('fixers-t4', 'Paolo Reyes (demo)', 'tech.fixers.paolo.demo@jadplus.ae', 22),
  ],
  'demo-harbor-pm': [staff('pm-t2', 'Noura Al Ali (demo)', 'harbor.pm.noura.demo@jadplus.ae', 23)],
  'demo-harbor-re': [staff('re-t2', 'Karim Bassam (demo)', 'harbor.re.karim.demo@jadplus.ae', 24)],
};

/** JAD+ staff besides admin.demo@jadplus.ae (added by JAD+ Admin on the Staff page). */
export const JAD_STAFF: readonly (DemoPerson & { readonly role: 'jad_admin' | 'jad_viewer' })[] = [
  { ...staff('ops', 'Operations Demo', 'ops.demo@jadplus.ae', 30), role: 'jad_admin' },
  { ...staff('viewer', 'Viewer Demo', 'viewer.demo@jadplus.ae', 31), role: 'jad_viewer' },
];
