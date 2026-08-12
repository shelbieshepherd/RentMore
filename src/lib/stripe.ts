// Server-only Stripe client — lazy-env pattern mirroring src/db.ts.
//
// RentMore's OWNER runs the Connect platform on her own Stripe account (business
// secrets). The team's managed Stripe account sells subscriptions ONLY and is
// never used for customer payments. This module must only be imported from
// server fns / API routes (db-queries.ts does so via dynamic import so the
// stripe SDK never enters the client bundle).
//
// Architecture (Option A — separate charges, RentMore never merchant of record):
//  - PaymentIntents/Checkout sessions are created on the CONNECTED account via
//    the platform key with `on_behalf_of` + `application_fee_amount`.
//  - NO destination charges, NO direct charges, NO transfer_data — those would
//    make RentMore the merchant of record and violate the owner's hard rule.
import Stripe from "stripe";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — add the owner's Connect-enabled Stripe account keys to the Vercel env vars before online payments can run.",
    );
  }
  // API version left to the SDK default (pinned by the installed stripe version).
  cached = new Stripe(key);
  return cached;
}

export const RENTMORE_SITE_URL = "https://www.rentmorevrs.com";

export interface ConnectAccountInput {
  email: string;
  businessName?: string;
}

/** Express connected account (customer = PM company), US, card + ACH capabilities. */
export async function createConnectAccount(input: ConnectAccountInput) {
  return stripe().accounts.create({
    type: "express",
    country: "US",
    email: input.email,
    capabilities: {
      card_payments: { requested: true },
      us_bank_account_ach_payments: { requested: true },
    },
    business_type: "company",
    business_profile: {
      name: input.businessName || "RentMore customer",
      url: RENTMORE_SITE_URL,
    },
  });
}

export interface OnboardingLinkInput {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

/** Stripe-hosted Express onboarding link (KYC). */
export async function getOnboardingLink(input: OnboardingLinkInput) {
  return stripe().accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });
}

export interface CheckoutSessionInput {
  connectedAccountId: string;
  amountCents: number;
  productName: string;
  feeCents: number; // RentMore platform fee (application_fee_amount), from src/lib/fees.ts
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes?: ("card" | "us_bank_account")[];
}

/**
 * Stripe-hosted Checkout session charged ON the connected account:
 * `on_behalf_of` makes the customer the merchant of record; `application_fee_amount`
 * moves only RentMore's platform fee into RentMore's own balance. Never destination.
 */
export async function createCheckoutSession(input: CheckoutSessionInput) {
  return stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: input.productName },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: input.feeCents,
      on_behalf_of: input.connectedAccountId,
    },
    payment_method_types: input.paymentMethodTypes ?? ["card"],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Verify a Stripe webhook signature (STRIPE_WEBHOOK_SECRET). */
export function verifyWebhookEvent(body: string | Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set — add it to the Vercel env vars before enabling webhooks.",
    );
  }
  return stripe().webhooks.constructEvent(body, signature, secret);
}
