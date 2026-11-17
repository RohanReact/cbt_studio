import { Link } from 'react-router-dom';
import { planById } from '../../shared/plans';
import { useAuth } from '../lib/session';

export function UsageBanner() {
  const { billing } = useAuth();
  if (!billing) return null;

  if (billing.status === 'active' && billing.endsAt) {
    const plan = planById(billing.planId);
    const until = new Date(billing.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
      <p className="mb-4 text-sm text-slate-500">
        {plan?.name ?? 'Paid'} plan active until {until}. Papers and attempts are saved to your account.{' '}
        <Link to="/account" className="font-medium text-indigo-700">
          Account
        </Link>
      </p>
    );
  }

  const limit = billing.paperLimit ?? 1;
  const full = !billing.canUpload;
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${full ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-700'}`}>
      <p>
        Free plan · {billing.paperCount} of {limit} paper saved.
        {full
          ? ' Papers you already have stay available. Upgrade to import another.'
          : ' Import one paper and take it with the real timer, palette and score.'}
      </p>
      <Link to="/pricing" className="btn-primary py-1.5">
        View plans
      </Link>
    </div>
  );
}
