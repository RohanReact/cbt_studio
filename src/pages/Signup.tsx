import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthFrame, Field, safeNext } from '../components/AuthFrame';
import { ExamPicker } from '../components/ExamPicker';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/session';

export default function Signup() {
  const { user, loading, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [exams, setExams] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      setBusy(false);
      return;
    }
    if (!exams.length) {
      setError('Choose at least one exam. Pick "Any other PDF" if yours is not listed.');
      setBusy(false);
      return;
    }
    try {
      await signup(name, email, password, exams);
      navigate(next, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Create your account"
      subtitle="Tell us the exams you are preparing. Your library follows that list."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Name" type="text" value={name} onChange={setName} autoComplete="name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <p className="mb-3 text-xs text-slate-500">At least 8 characters. Upload only papers you have the right to use.</p>
        <p className="mb-2 text-sm font-medium text-slate-800">Which exams are you preparing for?</p>
        <p className="mb-2 text-xs text-slate-500">Select every exam that applies. CBT papers get that exam’s timer. Pen-and-paper and any other PDF can still be sat as a timed test.</p>
        <div className="mb-4 max-h-64 overflow-auto rounded-lg border border-slate-200 p-3">
          <ExamPicker value={exams} onChange={setExams} />
        </div>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          Create account
        </button>
      </form>
    </AuthFrame>
  );
}
