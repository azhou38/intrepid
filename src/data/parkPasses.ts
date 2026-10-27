// Park passes: a pass that lets a visitor into a park, or a whole system of parks, and so into every spot inside them.
// A spot that needs one (`needs: 'park-pass'`, free of its own) names it in `parkPass`, and its cost column shows the pass's
// price over its name ("AUD 10 / NT Parks Pass"). Each pass's price lives only here, so a fee change is one edit.
// `name` is the cost column's label: at most about 16 characters. `costMin`/`costMax` are the adult price of the shortest
// pass (a range where it changes by season); `note` records what the price is and where it comes from.

export interface ParkPass {
  name: string;
  costMin: number;
  costMax?: number;
  currency: string;
  note: string;
}

export const PARK_PASSES = {
  'nt-parks': {
    name: 'NT Parks Pass', costMin: 10, currency: 'AUD',
    note: 'NT Parks Visitor Pass, adult 1-day pass (3-day $20); visitors only, NT residents are exempt. Covers the NT Government parks and reserves listed on nt.gov.au/parks/visitor-pass (read 2026-10-25), not Kakadu or Uluru-Kata Tjuta.',
  },
  kakadu: {
    name: 'Kakadu Pass', costMin: 25, costMax: 40, currency: 'AUD',
    note: 'Kakadu park pass (Parks Australia), adult, valid seven days: $25 in the Wet, $40 in the Dry; NT residents are free.',
  },
  tidbinbilla: {
    name: 'Tidbinbilla Pass', costMin: 16.09, currency: 'AUD',
    note: 'Tidbinbilla Nature Reserve day pass, per private vehicle (tidbinbilla.act.gov.au/visit, read 2026-10-24).',
  },
  'flinders-chase': {
    name: 'Flinders Chase Pass', costMin: 14.9, costMax: 22.4, currency: 'AUD',
    note: 'Flinders Chase National Park entry, adult 1-day $14.90 (Parks SA park page, read 2026-10-25; the page header shows site entry $22.40 per person for two days).',
  },
  innes: {
    name: 'Innes Park Pass', costMin: 14.4, currency: 'AUD',
    note: 'Dhilba Guuranda-Innes National Park, per private vehicle per day (Parks SA).',
  },
  'ikara-flinders': {
    name: 'Ikara-Flinders Pass', costMin: 14.4, currency: 'AUD',
    note: 'Ikara-Flinders Ranges National Park, per vehicle per day (Parks SA).',
  },
  'gawler-ranges': {
    name: 'Gawler Ranges Pass', costMin: 14.4, currency: 'AUD',
    note: 'Gawler Ranges National Park, per vehicle per day (parks.sa.gov.au).',
  },
  'deep-creek': {
    name: 'Deep Creek Pass', costMin: 14.4, currency: 'AUD',
    note: 'Deep Creek National Park, per vehicle per day (Parks SA).',
  },
  'coffin-bay': {
    name: 'Coffin Bay Pass', costMin: 14.4, currency: 'AUD',
    note: 'Coffin Bay National Park, per vehicle per day (Parks SA).',
  },
  lincoln: {
    name: 'Lincoln Park Pass', costMin: 14.4, currency: 'AUD',
    note: 'Lincoln National Park, per vehicle per day (Parks SA).',
  },
  'mount-remarkable': {
    name: 'Mt Remarkable Pass', costMin: 14.4, currency: 'AUD',
    note: 'Mount Remarkable National Park, per vehicle per day (Parks SA).',
  },
} satisfies Record<string, ParkPass>;

export type ParkPassId = keyof typeof PARK_PASSES;
