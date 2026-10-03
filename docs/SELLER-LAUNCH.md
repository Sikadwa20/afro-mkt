# AfroMkt seller-onboarding launch

These changes are prepared locally against GitHub commit `e6f1f26`. They are not deployed.
Public Supabase URLs and the browser anon key are centralized in `config.js`; this file must never contain server secrets.
Buyer purchases are intentionally unavailable. This is a seller-subscription and listing-review launch.

## What changed

- The first-month 100% discount is automatically applied to either plan through one shared Stripe promotion/coupon pool capped at 10 redemptions. The function validates the coupon duration and cap and rejects a product restriction that excludes either plan.
- Checkout uses a server-side plan allowlist and explicit Stripe mode configuration. Test keys cannot accidentally be used with the default live prices. Visitors see a support message instead of internal Stripe errors.
- Email subscription lookups verify the signed-in Supabase user and require an exact email match. The checkout return path only accepts completed, paid (or free/trial) subscription sessions.
- Bulk and welcome email functions require a verified administrator. Administrator status must be assigned through trusted server-controlled `app_metadata`, never signup fields.
- Webhooks verify signatures and reconcile the current Stripe subscription on retries and out-of-order events. Failed renewals and cancellations revoke active listing entitlements.
- Subscription and waitlist tables are server-only. Public product requests omit seller email addresses.
- An active subscription is required to submit products. Basic accounts can create at most 10 listings; Premium accounts can create more. Database locks serialize concurrent inserts. Existing listings are retained after a downgrade, but new inserts are blocked while over the Basic limit.
- Listings require operator approval before appearing publicly. Editing a listing sends it back for review. No existing listings are automatically approved.
- Product uploads use authenticated UUID folders, a 5 MB limit, and JPG/PNG/WebP only.
- Waitlist functions use `created_at`; the migration preserves historical `joined_at` dates. Saved signups remain successful even if email delivery fails.
- Sign In opens the dashboard, the homepage opens the product preview, and the shop no longer offers nonfunctional purchase buttons. English, Portuguese, French, and Spanish launch notices reflect seller onboarding.
- Crawler files, a real 404 page, social image paths, and basic response headers are supplied. The Cloudflare build publishes website files only.

## Deployment order

First make a database backup and validate this sequence in a separate Supabase staging project.
The SQL was tested with local PostgreSQL against both SQL schemas in this repository, not your production schema.
Inventory existing tables, grants, policies, and function versions before changing production.
For a separate staging frontend, replace the two public values in `config.js` with that staging project’s URL and anon key, and allow the staging dashboard redirect in its Auth settings. Never switch production secrets into test mode for staging.

### 1. Prepare Supabase database and authentication

Run these SQL files in order in the Supabase SQL Editor:

1. `supabase/seller_subscriptions.sql`
2. `supabase/products_table.sql`
3. `supabase/seller_onboarding_launch.sql`

The migration adds columns, changes grants/policies, and adds listing rules. It does not delete seller or product records.
All existing products start unapproved unless already approved in a previous run. Review them before enabling public visibility.
Do not rerun the old base schema after the launch migration.

Enable Email/Password authentication and email confirmation. Configure the site URL as `https://afro-mkt.com`
and the email confirmation redirect as `https://afro-mkt.com/dashboard.html`.
Configure production authentication email delivery and test it. Require sellers to use the same email for checkout and their account.

Approve an individual reviewed listing in the SQL Editor with its actual UUID:

```sql
update public.products set is_approved = true where id = 'REVIEWED-PRODUCT-UUID';
```

The private schema must not be added to Supabase's exposed API schemas.
Check the Storage bucket's public flag: product images are intended to be public when their URLs are known.
Do not upload identity documents or other private files to `product-images`.

### 2. Configure Stripe secrets in Supabase

Set these in **Supabase → Edge Functions → Secrets**. Do not put secret values in GitHub, Cloudflare's frontend, or chat.

| Secret | Production value |
| --- | --- |
| `STRIPE_MODE` | `live` |
| `STRIPE_SECRET_KEY` | The existing secret key from the Stripe live account that owns the prices |
| `STRIPE_BASIC_PRICE_ID` | `price_1UJ7Pp4Poh3P3Yxvs6XGZQz0` (verify €9.99/month in Stripe) |
| `STRIPE_PREMIUM_PRICE_ID` | `price_1UJ7Qk4Poh3P3YxvDnZ1nDsT` (verify €24.99/month in Stripe) |
| `STRIPE_LAUNCH_PROMOTION_CODE_ID` | The existing `promo_...` ID for the single AFRO10FREE promotion code; recommended to pin the campaign. If omitted, exactly one matching code must exist. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the live webhook endpoint below |
| `RESEND_API_KEY` | Existing Resend key; verify `noreply@afro-mkt.com` is an allowed sender |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.
Legacy `SB_PROJECT_URL` / `SB_SERVICE_ROLE_KEY` names remain supported as fallbacks.
For staging, set `STRIPE_MODE=test`, the matching test key, and two distinct test price IDs explicitly.

### 3. Deploy Supabase functions separately from Cloudflare

Pushing to GitHub does not deploy Supabase Edge Functions automatically in this repository.
Deploy all six function directories, including the new `_shared` dependencies. Use the CLI from the repository root
so the module imports and `supabase/config.toml` are included:

```sh
supabase link --project-ref nmusxculduptvefgqfjn
supabase functions deploy
```

The `blast-waitlist` and `send-welcome-email` functions must have JWT verification ON; both also verify administrator status in code.
Public checkout, signed Stripe webhooks, public waitlist, and checkout-session return lookup have verification OFF in configuration;
subscription email lookup still verifies the user's access token inside the handler.
Do not use blanket `--no-verify-jwt` deployment flags.
Neither administrator email function is called automatically by this patch.

### 4. Verify Stripe live webhook and promotion

Endpoint:

`https://nmusxculduptvefgqfjn.supabase.co/functions/v1/stripe-webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Verify deliveries succeed and `seller_subscriptions` records use the purchaser's lowercase email.
The webhook checks current Stripe state instead of trusting event arrival order.
Configure one coupon in the **live** Stripe account with `percent_off=100`, `duration=once`, and `max_redemptions=10`. Create one `AFRO10FREE` promotion code for that coupon, also with `max_redemptions=10`, valid for both Basic and Premium products. Prefer first-time-customer restriction to discourage repeated use. Do not create separate 10-use pools for each plan. Verify both prices recur monthly.
The checkout backend applies this promotion automatically. Stripe enforces the shared redemption limit. Regular monthly billing starts after the discounted first invoice; seller-facing plan notes disclose this renewal.
The code counts successful promotion redemptions, not registrations or abandoned checkout sessions. If the promotion is missing or incorrectly configured, checkout fails safely instead of silently charging one of the first sellers.
Enable the Stripe customer portal so sellers can cancel/manage billing; add its link to the public seller terms or support instructions.

### 5. Publish frontend through Cloudflare Pages

After reviewing/merging the GitHub changes, configure the Pages project:

- Production branch: your existing production branch (currently `main`).
- Framework preset: None.
- Build command: `node scripts/build.mjs`.
- Build output directory: `dist`.
- Node runtime: version 24 (or at least 22.18 for local tests).

The build needs no secret keys. Deploy the frontend only after the database/functions are ready.
The `dist` output excludes Supabase source, SQL, tests, and documentation.
Verify `/robots.txt`, `/sitemap.xml`, `/afromkt-facebook-cover.png`, and a nonexistent URL after deployment.
Missing pages should return 404 rather than the homepage.

## Verification completed locally

The automated suite tests live/test key mismatches, Basic/Premium session creation, invalid plans,
email ownership, unauthenticated email senders, incomplete checkout, webhook signatures/retries,
waitlist mail failures, and script syntax. PostgreSQL tests exercise both the old store-linked schema
and the newer dashboard schema: migration retries, private tables, owner-only access, unpaid listing denial,
Basic's 10-listing cap, Premium >10, approval protection, edit re-review, cancellation visibility, and upload folder restrictions.
Requests to Stripe and email providers in these tests are mocked; no charges or real emails are sent.

The suite currently contains 17 passing tests.

Run with Node 24 and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

## Remaining launch checks

- Publish reviewed Terms, Privacy, and Seller Agreement pages with the real operator details, fees, cancellation/refund terms, and data practices. Existing email-only legal links are not replaced with invented policy text.
- Verify the live account secrets, webhooks, authentication email, and Resend DNS/sender setup in the actual dashboards.
- Add reviewed seller listings; the public Supabase request currently returns zero active products.
- Complete staging signup → email confirmation → test subscription → dashboard → product upload → moderation approval.
- Test Basic's limit, failed renewal, cancellation, promotion redemption limits, and seller billing management.
- Re-test both production checkout buttons and webhook records after deployment. A live payment test requires the owner's explicit spending authorization; none has been performed.
- Do not send a launch email blast until these checks pass. Add abuse protection to the public waitlist before a large promotion.

References: [Supabase secrets](https://supabase.com/docs/guides/functions/secrets),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Stripe keys](https://docs.stripe.com/keys), [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks),
[Cloudflare Pages routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).
