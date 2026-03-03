import { useState } from 'react';
import { login, register } from '../api';

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
    const email = (form.elements.namedItem('auth-email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('auth-password') as HTMLInputElement).value;
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
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1 className="auth-title">Auto Apply</h1>
        <p className="auth-subtitle">Your AI job application assistant</p>

        <form id="auth-form" className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            name="auth-email"
            placeholder="Email"
            required
            autoComplete="email"
            className="auth-input"
          />
          <input
            type="password"
            name="auth-password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            autoComplete="current-password"
            className="auth-input"
          />
          <button
            type="submit"
            className="auth-btn auth-btn-primary"
            disabled={loading}
          >
            {loading ? (isSignUp ? 'Signing up...' : 'Signing in...') : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <p className="auth-toggle">
          <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
          <button
            type="button"
            className="auth-btn-link"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
