import type { SubmissionMetadata } from '@formyx/shared';
import type { Random } from './random.js';

// Made-up respondents for the demo. Email addresses use the reserved example.* domains and
// phone numbers the ranges set aside for fiction, so none of them belongs to a real person.

const FIRST_NAMES = (
  'Amara Ben Chloe Daniel Elena Farah Gabriel Hana Isaac Jade Kofi Lena Mateo Nadia ' +
  'Oliver Priya Quinn Rosa Samir Tara Umar Vera Wei Ximena Yusuf Zoe Aiko Bruno Carmen ' +
  'Dev Emeka Freya Hugo Ines Jonas Kavya Liam Maya Noah Olga Pablo Rhea Sofia Tomás Uma ' +
  'Victor Yara Zain Anya Callum'
).split(' ');

const LAST_NAMES = (
  'Okafor Novak Chen Haddad Kowalski Mensah Rossi Tanaka Silva Fischer Patel Larsen ' +
  'Moreau Ibrahim Byrne Kim García Nguyen Andersson Adeyemi Murphy Costa Schmidt Hughes ' +
  'Rahman Dubois Yilmaz Petrov Walsh Sato Mendes Ahmed Varga Lindqvist Osei Bianchi ' +
  'Reyes Kaur Jensen Nakamura'
).split(' ');

const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'] as const;

export interface Person {
  name: string;
  email: string;
}

/** "Tomás García" -> "tomas.garcia" */
function emailLocalPart(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');
}

/** Hands out people with distinct email addresses. */
export function createPeople(random: Random) {
  const used = new Set<string>();

  return function nextPerson(): Person {
    const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
    const local = emailLocalPart(name);
    const domain = random.pick(EMAIL_DOMAINS);
    let email = `${local}@${domain}`;
    for (let n = 2; used.has(email); n++) email = `${local}${String(n)}@${domain}`;
    used.add(email);
    return { name, email };
  };
}

/** A UK number from Ofcom's drama range or a US 555-01xx number. */
export function fictionalPhone(random: Random): string {
  const ending = String(random.int(0, 99)).padStart(2, '0');
  return random.chance(0.6)
    ? `+44 7700 900${String(random.int(0, 999)).padStart(3, '0')}`
    : `+1 (202) 555-01${ending}`;
}

const USER_AGENTS: readonly (readonly [string, number])[] = [
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    26,
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    14,
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    12,
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    24,
  ],
  [
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    14,
  ],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', 5],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    5,
  ],
];

/** Where respondents came from; `null` is a direct visit or a link from an email app. */
export type ReferrerMix = readonly (readonly [string | null, number])[];

export function respondentMetadata(random: Random, referrers: ReferrerMix): SubmissionMetadata {
  return { userAgent: random.weighted(USER_AGENTS), referrer: random.weighted(referrers) };
}
