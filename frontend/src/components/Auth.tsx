import { useState } from "react";
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
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] bg-card border border-border rounded-xl py-10 px-8 text-center">
        <h1 className="text-[28px] font-semibold text-text mb-1">Merit</h1>
        <p className="text-text-muted text-sm mb-8">
          Your AI job application assistant
        </p>

        <form
          id="auth-form"
          className="flex flex-col gap-3"
          onSubmit={handleSubmit}
        >
          <input
            type="email"
            name="auth-email"
            placeholder="Email"
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-input border border-border rounded-lg text-text text-[15px] outline-none transition-[border-color] focus:border-accent placeholder:text-text-muted"
          />
          <input
            type="password"
            name="auth-password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            autoComplete="current-password"
            className="w-full px-4 py-3 bg-input border border-border rounded-lg text-text text-[15px] outline-none transition-[border-color] focus:border-accent placeholder:text-text-muted"
          />
          <button
            type="submit"
            className="py-3 px-6 rounded-lg text-[15px] font-medium bg-accent text-on-primary disabled:opacity-60 disabled:cursor-not-allowed transition-[background,opacity] hover:bg-accent-hover"
            disabled={loading}
          >
            {loading
              ? isSignUp
                ? "Signing up..."
                : "Signing in..."
              : isSignUp
                ? "Sign Up"
                : "Sign In"}
          </button>
        </form>

        <p className="mt-5 text-sm text-text-muted">
          <span>
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
          </span>
          <button
            type="button"
            className="ml-1 bg-transparent border-0 text-accent cursor-pointer text-sm font-sans p-0 hover:underline"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>

        {error && (
          <p className="text-danger text-sm mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
