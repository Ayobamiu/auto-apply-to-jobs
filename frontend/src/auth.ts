import { register, login } from './api.js';

export function renderAuth(
  container: HTMLElement,
  onSuccess: () => void
): void {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <h1 class="auth-title">Auto Apply</h1>
        <p class="auth-subtitle">Your AI job application assistant</p>

        <form id="auth-form" class="auth-form">
          <input
            type="email"
            id="auth-email"
            placeholder="Email"
            required
            autocomplete="email"
            class="auth-input"
          />
          <input
            type="password"
            id="auth-password"
            placeholder="Password (min 8 characters)"
            required
            minlength="8"
            autocomplete="current-password"
            class="auth-input"
          />
          <button type="submit" id="auth-submit" class="auth-btn auth-btn-primary">
            Sign In
          </button>
        </form>

        <p class="auth-toggle">
          <span id="auth-toggle-text">Don't have an account?</span>
          <button id="auth-toggle-btn" class="auth-btn-link">Sign Up</button>
        </p>

        <p id="auth-error" class="auth-error" hidden></p>
      </div>
    </div>
  `;

  let isSignUp = false;
  const form = document.getElementById('auth-form') as HTMLFormElement;
  const emailInput = document.getElementById('auth-email') as HTMLInputElement;
  const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
  const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;
  const toggleText = document.getElementById('auth-toggle-text')!;
  const toggleBtn = document.getElementById('auth-toggle-btn')!;
  const errorEl = document.getElementById('auth-error')!;

  toggleBtn.addEventListener('click', () => {
    isSignUp = !isSignUp;
    submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    toggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    toggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
    errorEl.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = isSignUp ? 'Signing up...' : 'Signing in...';

    try {
      if (isSignUp) {
        await register(emailInput.value.trim(), passwordInput.value);
        await login(emailInput.value.trim(), passwordInput.value);
      } else {
        await login(emailInput.value.trim(), passwordInput.value);
      }
      onSuccess();
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Authentication failed';
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    }
  });
}
