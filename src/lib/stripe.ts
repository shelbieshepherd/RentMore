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
//    the platform key with `on_behalf_of`. NO application_fee_amount — RentMore
//    takes zero transaction fee.
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

/** Express connected account (customer = PM company), US, card + ACH capabilities.
 * `transfers` is required alongside `card_payments` for the separate charges &
 * transfers model (`on_behalf_of`): Stripe rejects `card_payments` without
 * `transfers` on this model. */
export async function createConnectAccount(input: ConnectAccountInput) {
  return stripe().accounts.create({
    type: "express",
    country: "US",
    email: input.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      us_bank_account_ach_payments: { requested: true },
    },
    // NOTE: business_type intentionally NOT set. Stripe's API marks it
    // optional on account creation (docs.stripe.com/api/accounts/create),
    // and Express hosted onboarding collects the entity type from the user
    // (individual / sole proprietor / company) when it's unset. Hardcoding
    // "company" forced EIN-based company fields on every PM — blocking
    // sole-proprietor PMs, the core 5–50 unit market. (2026-08-13)
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
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes?: ("card" | "us_bank_account")[];
}

/**
 * Stripe-hosted Checkout session charged ON the connected account:
 * `on_behalf_of` makes the customer the merchant of record. No
 * application_fee_amount — RentMore takes zero transaction fee. Never destination.
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
      on_behalf_of: input.connectedAccountId,
    },
    payment_method_types: input.paymentMethodTypes ?? ["card"],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Verify a Stripe webhook signature (STRIPE_WEBHOOK_SECRET).
 * Async: the SDK's sync constructEvent throws under SubtleCryptoProvider
 * (Bun/edge runtimes; also picks WebCrypto on Node 22), so use the async
 * variant which works in every runtime. */
export async function verifyWebhookEvent(body: string | Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set — add it to the Vercel env vars before enabling webhooks.",
    );
  }
  return stripe().webhooks.constructEventAsync(body, signature, secret);
}
