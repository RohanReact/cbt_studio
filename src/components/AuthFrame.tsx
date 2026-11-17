import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MonitorCheck } from 'lucide-react';

export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-5xl items-center gap-10 py-6 lg:grid-cols-2">
      <div className="hidden lg:block">
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white">
          <MonitorCheck size={22} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Practice the paper the way the exam is actually sat.</h1>
        <p className="mt-3 text-slate-600">
          Import a PDF for CAT, GATE, JEE, NEET, CUET, CLAT, SSC, or any other exam. Your account keeps the paper, the answer key and every attempt.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-slate-700">
          <li>Pick your exams when you create the account. The library follows that list.</li>
          <li>CBT papers get the hall timer. Any other PDF can still be sat as a timed test.</li>
          <li>Only upload papers you have the right to use.</li>
        </ul>
      </div>
      <div className="card mx-auto w-full max-w-md p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-5 text-sm text-slate-600">{footer}</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input className="input w-full px-3 py-2.5" type={type} value={value} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
        <MonitorCheck size={18} />
      </span>
      CBT Studio
    </Link>
  );
}
