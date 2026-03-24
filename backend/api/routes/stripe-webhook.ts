import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { setUserSubscriptionFromStripe } from '../db.js';

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getStripe(): Stripe {
  // Reuse STRIPE_SECRET_KEY for webhook handlers too.
  const secretKey = getRequiredEnv('STRIPE_SECRET_KEY');
  return new Stripe(secretKey);
}

export function extractUserIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const raw = metadata.userId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function extractCustomerId(
  customer: string | Stripe.Customer | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id ?? null;
}

export async function postStripeWebhook(req: Request, res: Response): Promise<void> {
  const stripeSignature = req.headers['stripe-signature'];
  if (typeof stripeSignature !== 'string') {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  const webhookSecret = getRequiredEnv('STRIPE_WEBHOOK_SECRET');
  const stripe = getStripe();

  // Express raw parser gives us a Buffer here.
  const rawBody = (req as Request & { body?: unknown }).body;
  if (!rawBody || !(rawBody instanceof Buffer)) {
    res.status(400).send('Missing raw body');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid webhook signature';
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = extractUserIdFromMetadata(session.metadata as Record<string, unknown> | null | undefined);
      if (!userId) {
        res.status(400).json({ error: 'Missing userId metadata on checkout session' });
        return;
      }

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      const customerId = extractCustomerId(session.customer as any);

      let currentPeriodEnd: Date | null = null;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const currentPeriodEndSec = (subscription as any).current_period_end as number | null | undefined;
        currentPeriodEnd = currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : null;
      }

      await setUserSubscriptionFromStripe(userId, {
        subscription_status: 'pro',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_end: currentPeriodEnd,
      });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = extractUserIdFromMetadata(subscription.metadata as Record<string, unknown> | null | undefined);
      if (!userId) {
        res.status(400).json({ error: 'Missing userId metadata on subscription' });
        return;
      }

      const customerId = extractCustomerId(subscription.customer as any);
      await setUserSubscriptionFromStripe(userId, {
        subscription_status: 'cancelled',
        stripe_customer_id: customerId,
        stripe_subscription_id: (subscription as any).id ?? null,
        current_period_end: null,
      });
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;
      const subscriptionIdRaw = invoice.subscription;
      const subscriptionId =
        typeof subscriptionIdRaw === 'string'
          ? subscriptionIdRaw
          : subscriptionIdRaw?.id ?? null;

      if (!subscriptionId) {
        res.status(400).json({ error: 'invoice.subscription missing' });
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionAny = subscription as any;
      const userId = extractUserIdFromMetadata(
        subscriptionAny.metadata as Record<string, unknown> | null | undefined,
      );
      if (!userId) {
        res.status(400).json({ error: 'Missing userId metadata on subscription' });
        return;
      }

      const customerId = extractCustomerId(subscriptionAny.customer as any);
      await setUserSubscriptionFromStripe(userId, {
        subscription_status: 'free',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionAny.id ?? null,
        current_period_end: null,
      });
    }

    // Stripe expects a 2xx within a short window.
    res.status(200).json({ received: true, type: event.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to handle webhook';
    res.status(500).json({ error: message });
  }
}

