import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Sparkles } from "lucide-react";
import { login, register } from "../api";

interface AuthProps {
  onSuccess: () => void;
}

export function Auth({ onSuccess }: AuthProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const email = (
      form.elements.namedItem("auth-email") as HTMLInputElement
    ).value.trim();
    const password = (
      form.elements.namedItem("auth-password") as HTMLInputElement
    ).value;
    if (!email || !password) return;

    setLoading(true);
    try {
      if (isSignUp) {
        await register(email, password);
        await login(email, password);
      } else {
        await login(email, password);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-gray-900 flex flex-col">
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
        <div className="max-w-md mx-auto w-full flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 no-underline transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back to home
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 no-underline text-gray-900 font-semibold text-[15px] tracking-tight"
          >
            <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" aria-hidden />
            </span>
            Merit
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[420px]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm shadow-gray-200/50 px-6 py-8 md:px-8 md:py-9">
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold text-gray-950 tracking-tight">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h1>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                {isSignUp
                  ? "Start tailoring resumes and applying faster with Merit."
                  : "Sign in to continue to your dashboard."}
              </p>
            </div>

            <div
              className="flex p-1 rounded-xl bg-gray-100 mb-6"
              role="tablist"
              aria-label="Account mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isSignUp}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  !isSignUp
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
                onClick={() => {
                  setIsSignUp(false);
                  setError(null);
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignUp}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  isSignUp
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
                onClick={() => {
                  setIsSignUp(true);
                  setError(null);
                }}
              >
                Sign up
              </button>
            </div>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="text-left">
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  name="auth-email"
                  required
                  autoComplete="email"
                  disabled={loading}
                  placeholder="you@university.edu"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 outline-none transition-shadow disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:border-blue-500"
                />
              </div>

              <div className="text-left">
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  name="auth-password"
                  required
                  minLength={isSignUp ? 8 : undefined}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  disabled={loading}
                  placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 outline-none transition-shadow disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:border-blue-500"
                />
                {isSignUp && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Use at least 8 characters.
                  </p>
                )}
              </div>

              {error && (
                <div
                  className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-left"
                  role="alert"
                >
                  <AlertCircle
                    className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
                    aria-hidden
                  />
                  <p className="text-sm text-red-800 leading-snug">{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-lg text-[15px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-600/25"
                disabled={loading}
              >
                {loading
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              {isSignUp ? "Already have an account?" : "New to Merit?"}{" "}
              <button
                type="button"
                className="bg-transparent border-0 p-0 text-blue-600 font-medium cursor-pointer hover:underline text-sm"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
