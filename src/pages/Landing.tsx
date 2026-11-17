import { Link } from 'react-router-dom';
import { Clock, FileUp, KeyRound, MonitorCheck } from 'lucide-react';
import { PlanPicker } from '../components/PlanPicker';

const steps = [
  ['Import', 'Drop one or many question-paper PDFs. A separate answer key links itself when the filename says key or answer.'],
    ['Review', 'Check questions, options and answers. A known exam sets the timer. Any other paper uses Custom, where you set the minutes.'],
  ['Attempt', 'The test runs like the hall: timer, question palette, mark for review, and save as you go.'],
  ['Score', 'Submit for the score and a dashboard across every paper. If the answer key comes later, upload it and the result updates.'],
];

export default function Landing() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-10 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-12">
        <div>
          <p className="text-sm font-semibold tracking-wide text-indigo-700 uppercase">CAT · GATE · CTET · MHT-CET · JEE Main</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Turn any question paper into the computer-based test.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            The PDF is easy to find. The exam screen is not. CBT Studio reads the paper, keeps it in your account, and gives you the timer, palette and instant score.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/signup" className="btn-primary px-4 py-2.5">
              Create a free account
            </Link>
            <Link to="/pricing" className="btn-secondary px-4 py-2.5">
              See plans
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">Free includes 1 paper with the full test screen. No card required.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between bg-ion-blue px-4 py-3 text-white">
            <span className="text-sm font-semibold">GATE CS · Mock</span>
            <span className="inline-flex items-center gap-1 text-sm">
              <Clock size={14} /> 02:41:18
            </span>
          </div>
          <div className="grid grid-cols-[1fr_148px]">
            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">Question 12 · MCQ · +2 / −0.66</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                A question from your PDF sits here, with the original options. Diagrams stay on the page image beside the answer panel.
              </p>
              <div className="mt-4 space-y-2 text-sm">
                {['Option A', 'Option B', 'Option C', 'Option D'].map((label, index) => (
                  <div key={label} className={`rounded-lg border px-3 py-2 ${index === 1 ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="border-l border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-500">Palette</p>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={`qbadge qbadge-${['answered', 'notAnswered', 'marked', 'notVisited'][i % 4]} text-xs`}>
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl py-8">
        <h2 className="text-2xl font-semibold text-slate-900">How a paper becomes a test</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {steps.map(([title, copy], index) => (
            <div key={title} className="card p-4">
              <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{index + 1}</div>
              <h3 className="font-medium text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icon: FileUp, title: 'Many PDFs at once', copy: 'Question paper and answer key can be separate files.' },
            { icon: KeyRound, title: 'Answer key optional', copy: 'Without a key you still get the full test. With a key you get the score.' },
            { icon: MonitorCheck, title: 'Same screen as the hall', copy: 'Section locks, mark for review, and a clock that keeps running.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <Icon className="text-indigo-600" size={18} />
                <div>
                  <h3 className="text-sm font-medium text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.copy}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl py-4">
        <h2 className="text-2xl font-semibold text-slate-900">CBT exams, and every other paper</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Timers and marking are ready for CAT, GATE, JEE Main, JEE Advanced, MHT-CET, BITSAT, CUET, NEET UG, NEET PG, CLAT, CMAT, SSC CGL, IBPS PO and UPSC CSE Prelims.
          NEET UG and UPSC are not computer-based in the hall. Drop the PDF anyway and sit it on screen. Any paper that is not in that list uses Custom: you set the minutes and the marks.
        </p>
      </section>

      <section className="mx-auto max-w-6xl py-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Plans</h2>
            <p className="mt-1 text-sm text-slate-600">Start free with one paper. Move to a paid plan when the library needs to grow.</p>
          </div>
        </div>
        <PlanPicker />
      </section>
    </div>
  );
}
