(function () {
  const form = document.getElementById('waitlist-form');
  const emailInput = document.getElementById('email');
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('form-message');

  const apiBase =
    document.documentElement.getAttribute('data-api-url') ||
    document.body.getAttribute('data-api-url') ||
    '';

  function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = 'mt-3 text-sm min-h-[1.25rem] ' + (isError ? 'text-red-400' : 'text-emerald-400');
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.className = 'mt-3 text-sm min-h-[1.25rem]';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMessage();
    const email = emailInput.value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining…';

    try {
      const endpoint = apiBase
        ? (apiBase.includes('script.google.com') ? apiBase : apiBase.replace(/\/$/, '') + '/waitlist')
        : '/waitlist';
      const useCorsProxy = endpoint.includes('script.google.com');
      const fetchUrl = useCorsProxy ? 'https://corsproxy.io/?' + encodeURIComponent(endpoint) : endpoint;
      const res = await fetch(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      });
      const data = await res.json().catch(function () { return {}; });

      if (res.ok) {
        form.remove();
        const ctaSection = document.getElementById('cta-section');
        const success = document.createElement('p');
        success.className = 'text-lg text-emerald-400';
        success.textContent = "You're on the list. We'll be in touch.";
        ctaSection.appendChild(success);
        return;
      }

      if (res.status === 409) {
        setMessage('Already on the list.', true);
      } else {
        setMessage(data.error || 'Something went wrong. Please try again.', true);
      }
    } catch (err) {
      setMessage('Something went wrong. Please try again.', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get early access';
    }
  });
})();
