import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn } from "../api";
import animation from "../assets/animation.gif";

function CheckIcon({ gray = false }: { gray?: boolean }) {
  return (
    <span
      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0
        ${gray ? "bg-gray-100" : "bg-green-100"}`}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M1.5 4l2 2 3-3"
          stroke={gray ? "#6b7280" : "#16a34a"}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function LogoIcon() {
  return (
    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M2 7l3.5 3.5 6.5-7"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/discover", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-sm font-medium text-gray-900">Merit</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/auth")}
            className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate("/auth")}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 pt-20 pb-12 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mb-6">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" fill="#2563EB" />
            <path
              d="M3.5 6l2 2 3-3"
              stroke="white"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Built for Handshake students
        </div>

        <h1 className="text-5xl font-semibold text-gray-950 leading-tight tracking-tight mb-4">
          Found a job on Handshake?{" "}
          <span className="text-blue-600">Let Merit apply for you.</span>
        </h1>

        <p className="text-base text-gray-500 leading-relaxed mb-8 max-w-lg mx-auto">
          Paste any Handshake job link. Merit tailors your resume, fills every
          form, and submits the application — automatically.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate("/auth")}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-xl transition-colors"
          >
            Get started free
          </button>
          <a
            href="#how-it-works"
            className="text-sm text-gray-600 hover:text-gray-800 px-6 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Demo GIF */}
      <div className="max-w-4xl mx-auto px-6 mb-24">
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <div className="flex-1 bg-white border border-gray-200 rounded-md px-3 py-1 mx-3">
              <span className="text-xs text-gray-400">merithq.io</span>
            </div>
          </div>
          <div className="bg-gray-50">
            <img
              src={animation}
              alt="Merit in action — paste a Handshake link and auto-apply"
              className="w-full h-auto block"
            />
          </div>
        </div>
      </div>

      {/* How it works */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 pb-24">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-widest text-center mb-3">
          How it works
        </p>
        <h2 className="text-3xl font-semibold text-gray-950 text-center tracking-tight mb-3">
          Apply in seconds, not hours
        </h2>
        <p className="text-sm text-gray-500 text-center mb-12">
          Three steps. No copying and pasting. No repetitive forms.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              num: "1",
              title: "Upload your resume",
              desc: "Merit learns your profile and uses it to tailor every application to the job.",
            },
            {
              num: "2",
              title: "Paste a Handshake link",
              desc: "Copy the link from any Handshake job and paste it into Merit. That's it.",
            },
            {
              num: "3",
              title: "Merit applies for you",
              desc: "Your resume is tailored, forms are filled, and the application is submitted automatically.",
            },
          ].map((step) => (
            <div
              key={step.num}
              className="bg-gray-50 border border-gray-100 rounded-2xl p-6"
            >
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                <span className="text-xs font-semibold text-blue-600">
                  {step.num}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-widest text-center mb-3">
          Pricing
        </p>
        <h2 className="text-3xl font-semibold text-gray-950 text-center tracking-tight mb-3">
          Simple, student-friendly pricing
        </h2>
        <p className="text-sm text-gray-500 text-center mb-10">
          Start free. Upgrade when you're ready.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Free */}
          <div className="border border-gray-100 rounded-2xl p-6">
            <p className="text-sm font-semibold text-gray-900 mb-1">Free</p>
            <p className="text-3xl font-bold text-gray-950 tracking-tight mb-0.5">
              $0
            </p>
            <p className="text-xs text-gray-400 mb-5">No credit card needed</p>
            <ul className="space-y-2.5 mb-6">
              {[
                "Auto-fill job application forms",
                "Generate resume and cover letter",
                "Review and download documents",
              ].map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <CheckIcon gray />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/auth")}
              className="w-full text-sm font-medium text-gray-700 border border-gray-200 hover:border-gray-300 py-2.5 rounded-xl transition-colors"
            >
              Get started free
            </button>
          </div>

          {/* Pro */}
          <div className="border-2 border-blue-600 rounded-2xl p-6">
            <span className="inline-block text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full mb-3">
              Most popular
            </span>
            <p className="text-sm font-semibold text-gray-900 mb-1">Pro</p>
            <p className="text-3xl font-bold text-gray-950 tracking-tight mb-0.5">
              $9
              <span className="text-sm font-normal text-gray-400">/mo</span>
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Everything in Free, plus:
            </p>
            <ul className="space-y-2.5 mb-6">
              {["Auto-submit applications"].map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/auth")}
              className="w-full text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl transition-colors"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-5 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-sm font-medium text-gray-900">Merit</span>
        </div>
        <p className="text-xs text-gray-400">
          © 2025 Merit. Built for students.
        </p>
      </footer>
    </div>
  );
}
