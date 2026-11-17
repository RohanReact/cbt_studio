/** Sticker prices in paise, tax included.
 * Weekly stays at a ₹100-class price for a last-week burst.
 * Monthly stays at a ₹300-class price.
 * Quarterly costs about the same as two monthly renewals and covers three months.
 */
export const PLANS = [
  {
    id: 'weekly',
    name: 'Weekly',
    pricePaise: 9900,
    days: 7,
    period: 'week',
    tagline: 'Last-week revision',
    detail: 'Unlimited papers for the week before the exam.',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    pricePaise: 29900,
    days: 30,
    period: 'month',
    tagline: 'Month of mocks',
    detail: 'A steady month of timed papers, with history saved to your account.',
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    pricePaise: 59900,
    days: 90,
    period: '3 months',
    tagline: 'Best for exam season',
    detail: 'Three months of practice for about the price of two monthly plans.',
    best: true,
  },
] as const;

export type PlanId = (typeof PLANS)[number]['id'];
export type Plan = (typeof PLANS)[number];

/** Free accounts can keep one paper, with the full test screen. */
export const FREE_PAPER_LIMIT = 1;

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function quarterlySavingsPaise(): number {
  const monthly = planById('monthly');
  const quarterly = planById('quarterly');
  if (!monthly || !quarterly) return 0;
  return monthly.pricePaise * 3 - quarterly.pricePaise;
}
