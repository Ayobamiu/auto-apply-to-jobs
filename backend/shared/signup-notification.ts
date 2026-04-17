type JsonRecord = Record<string, unknown>;

const DEFAULT_NOTIFICATION_EMAIL = 'ayobamiu@gmail.com';
const DEFAULT_FROM_EMAIL = 'Merit HQ <onboarding@resend.dev>';

function getNotificationRecipient(): string {
  const configured = process.env.SIGNUP_NOTIFICATION_TO?.trim();
  if (configured) return configured;
  return DEFAULT_NOTIFICATION_EMAIL;
}

/**
 * Sends an owner alert email when a new account is created.
 * Uses Resend API if RESEND_API_KEY is configured.
 */
export async function sendSignupNotification(userEmail: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[signup-notification] Skipped: RESEND_API_KEY is not set');
    return;
  }

  const to = getNotificationRecipient();
  const from = process.env.SIGNUP_NOTIFICATION_FROM?.trim() || DEFAULT_FROM_EMAIL;
  const createdAt = new Date().toISOString();

  const payload: JsonRecord = {
    from,
    to: [to],
    subject: 'New user signup',
    html: `<p>A new user signed up.</p><p><strong>Email:</strong> ${userEmail}</p><p><strong>Time (UTC):</strong> ${createdAt}</p>`,
    text: `A new user signed up.\nEmail: ${userEmail}\nTime (UTC): ${createdAt}`,
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[signup-notification] Failed (${response.status}): ${errorBody}`);
    }
  } catch (error) {
    console.error('[signup-notification] Failed to send email', error);
  }
}
