import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getUserEmailById, getUserSubscriptionStatus } from '../db.js';

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeClientUrl(clientUrl: string): string {
  return clientUrl.replace(/\/$/, '');
}

function getStripe(): Stripe {
  const secretKey = getRequiredEnv('STRIPE_SECRET_KEY');
  return new Stripe(secretKey);
}

export async function postCreateCheckout(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const email = await getUserEmailById(userId);
    if (!email) {
      res.status(404).json({ error: 'User email not found' });
      return;
    }

    const stripe = getStripe();
    const priceId = getRequiredEnv('STRIPE_PRICE_ID');
    const clientUrl = normalizeClientUrl(getRequiredEnv('CLIENT_URL'));

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${clientUrl}/?stripe=success`,
      cancel_url: `${clientUrl}/?stripe=cancel`,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
    });

    if (!session.url) {
      res.status(500).json({ error: 'Stripe did not return a checkout URL' });
      return;
    }

    res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout session';
    res.status(500).json({ error: message });
  }
}

export async function getSubscriptionStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const status = await getUserSubscriptionStatus(userId);
    res.status(200).json({
      subscription_status: status.subscription_status,
      current_period_end: status.current_period_end,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get subscription status';
    res.status(500).json({ error: message });
  }
}

export async function postSubscriptionPortal(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const status = await getUserSubscriptionStatus(userId);
    if (!status.stripe_customer_id) {
      res.status(400).json({ error: 'Stripe customer ID not found' });
      return;
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: status.stripe_customer_id,
      return_url: `${getRequiredEnv('CLIENT_URL')}/settings/subscription`,
    });
    res.status(200).json({ url: session.url });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create subscription portal session';
    res.status(500).json({ error: message });
  }
}


