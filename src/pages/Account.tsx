import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { ExamPicker } from '../components/ExamPicker';
import { formatInr, planById } from '../../shared/plans';
import { api, type PaymentRecord } from '../lib/api';
import { useAuth } from '../lib/session';
import { useAsync } from '../lib/useAsync';

export default function Account() {
  const { user, billing, logout, updateExams } = useAuth();
  const navigate = useNavigate();
  const { data: payments } = useAsync(() => api.payments(), []);
  if (!user || !billing) return null;

  const plan = billing.status === 'active' ? planById(billing.planId) : null;
  const until = billing.endsAt ? new Date(billing.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  const signOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Account</h1>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-medium text-slate-900">Profile</h2>
          <p className="mt-3 text-sm text-slate-800">{user.name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <button onClick={signOut} className="btn-secondary mt-5">
            <LogOut size={16} /> Sign out
          </button>
        </section>
        <section className="card p-5">
          <h2 className="font-medium text-slate-900">Plan</h2>
          {plan && until ? (
            <p className="mt-3 text-sm text-slate-700">
              {plan.name} is active until {until}. A new purchase extends from that date.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              Free plan · {billing.paperCount} of {billing.paperLimit ?? 1} paper saved.
              {billing.status === 'expired' && until ? ` The last plan ended on ${until}.` : ''}
            </p>
          )}
          <Link to="/pricing" className="btn-primary mt-5">
            {billing.status === 'active' ? 'Change or extend plan' : 'Upgrade'}
          </Link>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-medium text-slate-900">Exams</h2>
        <p className="mt-1 text-sm text-slate-500">Your library can be filtered to these. You can still import a PDF for an exam you did not pick.</p>
        <ExamEditor initial={user.exams} onSave={updateExams} />
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-medium text-slate-900">Payments</h2>
        {!payments?.length ? (
          <p className="mt-3 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {payments.map((payment) => (
              <PaymentLine key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
        {billing.provider === 'test' && (
          <p className="mt-4 text-xs text-slate-500">This server is in test checkout. Real cards are charged only after Razorpay keys are added.</p>
        )}
      </section>
    </div>
  );
}

function ExamEditor({ initial, onSave }: { initial: string[]; onSave: (exams: string[]) => Promise<void> }) {
  const [exams, setExams] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => setExams(initial), [initial]);
  const save = async () => {
    if (!exams.length) {
      setNote('Choose at least one exam.');
      return;
    }
    setBusy(true);
    setNote('');
    try {
      await onSave(exams);
      setNote('Saved.');
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4">
      <ExamPicker value={exams} onChange={setExams} />
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-secondary" onClick={save} disabled={busy}>
          Save exams
        </button>
        {note && <p className="text-sm text-slate-600">{note}</p>}
      </div>
    </div>
  );
}

function PaymentLine({ payment }: { payment: PaymentRecord }) {
  const plan = planById(payment.planId);
  const when = new Date(payment.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <div>
        <p className="font-medium text-slate-800">
          {plan?.name ?? payment.planId} · {formatInr(payment.amountPaise)}
        </p>
        <p className="text-slate-500">{when}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${payment.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {payment.status === 'paid' ? (payment.provider === 'test' ? 'Test · active' : 'Paid') : payment.status}
      </span>
    </li>
  );
}
