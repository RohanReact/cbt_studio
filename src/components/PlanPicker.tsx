import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { PLANS, formatInr, planById, quarterlySavingsPaise, type PlanId } from '../../shared/plans';
import { ApiError, api, type Checkout } from '../lib/api';
import { loadRazorpay } from '../lib/razorpay';
import { useAuth } from '../lib/session';

export function PlanPicker() {
  const { user, billing, refresh } = useAuth();
  const [pending, setPending] = useState<PlanId | null>(null);
  const [testCheckout, setTestCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const savings = formatInr(quarterlySavingsPaise());

  const choose = async (planId: PlanId) => {
    setError('');
    setDone('');
    setPending(planId);
    try {
      const checkout = await api.checkout(planId);
      if (checkout.mode === 'test') {
        setTestCheckout(checkout);
        setPending(null);
        return;
      }
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay || !checkout.keyId) {
        throw new Error('Payment window could not be opened.');
      }
      const plan = planById(planId);
      await new Promise<void>((resolve, reject) => {
        const checkoutUi = new window.Razorpay!({
          key: checkout.keyId!,
          amount: checkout.amountPaise,
          currency: 'INR',
          name: 'CBT Studio',
          description: plan?.name ?? 'Plan',
          order_id: checkout.orderId,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: '#4f46e5' },
          handler: (response) => {
            api
              .confirm({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              })
              .then(() => resolve())
              .catch(reject);
          },
          modal: { ondismiss: () => reject(new Error('Payment was closed before it finished.')) },
        });
        checkoutUi.on('payment.failed', (response) => reject(new Error(response.error.description || 'Payment failed.')));
        checkoutUi.open();
      });
      await refresh();
      setDone(`${plan?.name ?? 'Plan'} is active on your account.`);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Payment could not be completed.');
    } finally {
      setPending(null);
    }
  };

  const confirmTest = async () => {
    if (!testCheckout) return;
    setPending(testCheckout.planId);
    setError('');
    try {
      await api.confirm({ orderId: testCheckout.orderId });
      await refresh();
      const plan = planById(testCheckout.planId);
      setDone(`${plan?.name ?? 'Plan'} is active on this server. No card was charged.`);
      setTestCheckout(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not activate the plan.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const highlight = 'best' in plan && plan.best;
          const current = billing?.status === 'active' && billing.planId === plan.id;
          return (
            <article
              key={plan.id}
              className={`card relative flex flex-col p-5 ${highlight ? 'border-indigo-600 ring-2 ring-indigo-600' : ''}`}
            >
              {highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Best value
                </span>
              )}
              <p className="text-sm font-medium text-indigo-700">{plan.tagline}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{plan.name}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                {formatInr(plan.pricePaise)}
                <span className="text-base font-medium text-slate-500"> / {plan.period}</span>
              </p>
              <p className="mt-2 text-sm text-slate-600">{plan.detail}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {['Unlimited question papers', 'PDFs and scores saved to your account', 'Timer, palette and instant answer key'].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {user ? (
                  <button className={highlight ? 'btn-primary w-full' : 'btn-secondary w-full'} disabled={pending !== null} onClick={() => choose(plan.id)}>
                    {pending === plan.id ? <Loader2 className="animate-spin" size={16} /> : null}
                    {current ? `Extend ${plan.name.toLowerCase()}` : `Continue with ${plan.name.toLowerCase()}`}
                  </button>
                ) : (
                  <Link to={`/signup?next=${encodeURIComponent('/pricing')}`} className={highlight ? 'btn-primary w-full' : 'btn-secondary w-full'}>
                    Create account
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-slate-500">
        Prices include taxes. Quarterly works out to {formatInr(Math.round(59900 / 3))} a month and saves {savings} compared with three monthly payments.
        Weekly is the right plan for the last seven days, not for a full month.
      </p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}

      {testCheckout && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Test checkout</h3>
            <p className="mt-2 text-sm text-slate-600">
              Razorpay keys are not set on this server, so confirming activates {planById(testCheckout.planId)?.name} for{' '}
              {formatInr(testCheckout.amountPaise)} without charging a card. Add <span className="font-medium">RAZORPAY_KEY_ID</span> and{' '}
              <span className="font-medium">RAZORPAY_KEY_SECRET</span> before taking real payments.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setTestCheckout(null)} disabled={pending !== null}>
                Cancel
              </button>
              <button className="btn-primary" onClick={confirmTest} disabled={pending !== null}>
                {pending ? <Loader2 className="animate-spin" size={16} /> : null}
                Activate plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
