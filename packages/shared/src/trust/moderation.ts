import type { FormSchema } from '../forms/form-schema.js';

/*
 * The checks a form goes through when it is published. Phishing forms ask for the things a
 * bank or an identity check would: passwords, one-time codes, card details, Aadhaar numbers.
 * A form that does is held for a person to look at before anyone can open it.
 *
 * Strong terms hold a form on their own. Weak ones (a bank's name, "PIN", "KYC") are common
 * in harmless forms, a survey asking which bank someone uses, say, so it takes two different
 * ones together. "PIN code", India's postal code, never counts.
 */

export interface ModerationRule {
  id: string;
  /** What the form does, for the creator and the reviewer: "asks for a password". */
  label: string;
  pattern: RegExp;
  strength: 'strong' | 'weak';
}

const BANKS = [
  'SBI',
  'State Bank of India',
  'HDFC',
  'ICICI',
  'Axis Bank',
  'Kotak',
  'PNB',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank',
  'IndusInd',
  'Yes Bank',
  'IDFC',
  'Bank of India',
  'Indian Bank',
  'Federal Bank',
  'Paytm',
  'PhonePe',
  'Google Pay',
  'BHIM',
];

const words = (list: string[]) => list.map((word) => word.replace(/\s+/g, '\\s+')).join('|');

export const MODERATION_RULES: readonly ModerationRule[] = [
  {
    id: 'password',
    label: 'asks for a password',
    pattern: /\bpass\s?(?:words?|codes?)\b/i,
    strength: 'strong',
  },
  {
    id: 'otp',
    label: 'asks for a one-time code',
    pattern: /\bOTPs?\b|\bone[\s-]?time\s+(?:password|passcode|code|pin)s?\b/i,
    strength: 'strong',
  },
  {
    id: 'card_pin',
    label: 'asks for a card or UPI PIN',
    pattern: /\b(?:UPI|ATM|M|debit\s+card|credit\s+card|card)[\s-]?PINs?\b/i,
    strength: 'strong',
  },
  {
    id: 'cvv',
    label: "asks for a card's security code",
    pattern: /\b(?:CVV2?|CVC|card\s+verification\s+(?:value|code))\b/i,
    strength: 'strong',
  },
  {
    id: 'card_number',
    label: 'asks for card details',
    pattern: /\b(?:credit|debit|ATM)\s+card\s+(?:numbers?|no\.?|details|expiry)/i,
    strength: 'strong',
  },
  {
    id: 'net_banking',
    label: 'mentions net banking',
    pattern: /\b(?:net|internet|online)[\s-]?banking\b/i,
    strength: 'strong',
  },
  {
    id: 'aadhaar',
    label: 'asks for an Aadhaar number',
    pattern: /\b(?:aadhaa?r|adhaa?r)\b/i,
    strength: 'strong',
  },
  {
    id: 'verify_account',
    label: 'asks people to verify their account',
    pattern:
      /\bverify\s+(?:your|ur)\s+(?:account|identity|bank|card|details)\b|\b(?:account|card)\s+(?:has\s+been\s+|is\s+|will\s+be\s+)?(?:suspended|blocked|locked|deactivated|frozen)\b|\bupdate\s+(?:your\s+)?KYC\b/i,
    strength: 'strong',
  },
  {
    id: 'bank_name',
    label: 'names a bank or payment app',
    pattern: new RegExp(`\\b(?:${words(BANKS)})\\b`, 'i'),
    strength: 'weak',
  },
  {
    id: 'pin',
    // Not "PIN code" or "pincode": the postal code.
    label: 'asks for a PIN',
    pattern: /\bPINs?\b(?![\s-]*codes?\b)/i,
    strength: 'weak',
  },
  { id: 'kyc', label: 'mentions KYC', pattern: /\bKYC\b/i, strength: 'weak' },
  {
    id: 'account_number',
    label: 'asks for an account number',
    pattern: /\b(?:bank\s+)?account\s+(?:numbers?|no\.?)(?:\s|$|[^\w])/i,
    strength: 'weak',
  },
  {
    id: 'login',
    label: 'asks for login details',
    pattern: /\b(?:user\s?name|user\s?id|login\s+(?:id|details)|customer\s+id)\b/i,
    strength: 'weak',
  },
];

/** A piece of a form's text, and where it is: `fields.3.label`, `title`... */
export interface FormText {
  path: string;
  text: string;
}

/** What the rules found. */
export interface ModerationMatch {
  ruleId: string;
  label: string;
  path: string;
  /** The words around the match, for the reviewer. */
  excerpt: string;
}

export interface ModerationResult {
  /** Held for review. */
  flagged: boolean;
  /** Every match, strong and weak, one per rule and place. */
  matches: ModerationMatch[];
}

/** Keys whose values are ids, settings or addresses rather than words people read. */
const NOT_TEXT =
  /^(?:id|type|kind|operator|match|align|style|format|language|dateFormat|numberFormat|saveProgress|version|url|imageUrl|href|countryCode|currency|width|size|layout|value)$|Id$/;

/**
 * Every piece of text in the form people may read, with where it is. Walks the whole schema,
 * so a new kind of question can't slip text past the rules.
 */
export function collectFormText(schema: FormSchema, title: string): FormText[] {
  const texts: FormText[] = [{ path: 'title', text: title }];
  const visit = (value: unknown, path: string, key: string) => {
    if (typeof value === 'string') {
      if (!NOT_TEXT.test(key) && value.trim() !== '') texts.push({ path, text: value });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${path}.${index}`, key);
      });
    } else if (value !== null && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) {
        visit(child, path ? `${path}.${childKey}` : childKey, childKey);
      }
    }
  };
  visit(schema, '', '');
  return texts;
}

/** Look-alike letters and invisible characters folded away, so "pаsswоrd" still reads. */
export function normalizeForModeration(text: string): string {
  return (
    text
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
      // Cyrillic and Greek letters that look like Latin ones.
      .replace(/[аеорсухіјѕԁԛԝ]/g, (letter) => CONFUSABLES[letter] ?? letter)
      .replace(/[АВЕКМНОРСТХІЈЅ]/g, (letter) => CONFUSABLES[letter] ?? letter)
      .replace(/[οΟαΑεΕιΙκΚνΝτΤυΥχΧ]/g, (letter) => CONFUSABLES[letter] ?? letter)
      .replace(/\s+/g, ' ')
  );
}

const CONFUSABLES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  І: 'I',
  Ј: 'J',
  Ѕ: 'S',
  ο: 'o',
  Ο: 'O',
  α: 'a',
  Α: 'A',
  ε: 'e',
  Ε: 'E',
  ι: 'i',
  Ι: 'I',
  κ: 'k',
  Κ: 'K',
  ν: 'v',
  Ν: 'N',
  τ: 't',
  Τ: 'T',
  υ: 'u',
  Υ: 'Y',
  χ: 'x',
  Χ: 'X',
};

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/** Runs the rules over `texts`. */
export function moderateTexts(
  texts: readonly FormText[],
  rules: readonly ModerationRule[] = MODERATION_RULES,
): ModerationResult {
  const matches: ModerationMatch[] = [];
  for (const { path, text } of texts) {
    const normalized = normalizeForModeration(text);
    for (const rule of rules) {
      const found = rule.pattern.exec(normalized);
      if (!found) continue;
      matches.push({
        ruleId: rule.id,
        label: rule.label,
        path,
        excerpt: excerptAround(normalized, found.index, found[0].length),
      });
    }
  }
  const strength = new Map(rules.map((rule) => [rule.id, rule.strength]));
  const strong = matches.some((match) => strength.get(match.ruleId) === 'strong');
  const weak = new Set(
    matches.filter((match) => strength.get(match.ruleId) === 'weak').map((match) => match.ruleId),
  );
  return { flagged: strong || weak.size >= 2, matches };
}

/** The checks for a form about to be published. */
export function moderateForm(schema: FormSchema, title: string): ModerationResult {
  return moderateTexts(collectFormText(schema, title));
}

/** The rules a result tripped, once each: what the creator is told. */
export function matchedRuleLabels(matches: readonly ModerationMatch[]): string[] {
  return [...new Set(matches.map((match) => match.label))];
}

/** A form's matches as a set of rule ids, to tell whether a reviewer has seen them before. */
export function matchedRuleIds(matches: readonly ModerationMatch[]): string[] {
  return [...new Set(matches.map((match) => match.ruleId))].sort();
}
