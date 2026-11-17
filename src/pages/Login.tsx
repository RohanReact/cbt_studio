import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthFrame, Field, safeNext } from '../components/AuthFrame';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/session';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Papers and scores from your account open on this device."
      footer={
        <>
          New here?{' '}
          <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          Sign in
        </button>
      </form>
    </AuthFrame>
  );
}
