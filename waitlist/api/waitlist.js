const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzJtMpSzf0skaRriXw-CHqLcM_CLXP-PYq8iuXctuwaW_oqdUl8B2H7ekOh1cd8RVnBYw/exec';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  try {
    const proxyRes = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await proxyRes.json().catch(() => ({}));
    res.status(proxyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
