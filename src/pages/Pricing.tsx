import { PlanPicker } from '../components/PlanPicker';

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Simple plans for an exam season</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        A free account keeps one paper, with the timer, palette and score. Paid plans remove that limit and keep every PDF and attempt in your account.
        Quarterly is the plan that fits CAT, GATE and MHT-CET, because those cycles run for about three months.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Free', '₹0', '1 paper, full test screen'],
          ['Weekly ₹99', '7 days', 'For the final week. A full month costs less on the monthly plan.'],
          ['Quarterly ₹599', 'Best value', 'About the price of two monthly plans, for three months'],
        ].map(([title, price, copy]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-900">{title}</p>
            <p className="text-sm text-slate-500">{price}</p>
            <p className="mt-1 text-sm text-slate-600">{copy}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <PlanPicker />
      </div>
    </div>
  );
}
