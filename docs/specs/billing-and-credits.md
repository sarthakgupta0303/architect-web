# Spec — Billing, Credits and Usage

PRD Flow 12 (§14.4), §18.2 · FR-31 · Engineering doc §6.2 (Credits), §8.7 · Phase 1 (credits core) · Phase 2 (Stripe)

## 1. Plans

| Plan | Price | Monthly credits | Projects | Agent runs / mo | Features |
|---|---|---|---|---|---|
| free | $0 | 30 | 3 active | 1,000 | Architect subdomain, 1 production app |
| pro | $25/mo ($240/yr) | 150 | unlimited | 20,000 | custom domains, GitHub, Code mode, CLI, evals, 5 parallel builds |
| team | $40/user/mo ($384/user/yr) | 150 × seats pooled | unlimited | 50,000 × seats | roles, comments, alerts, HITL, priority support, 10 parallel builds |
| enterprise | custom | custom | unlimited | custom | SSO/SCIM, audit export, VPC |

Plan limits live in `lib/core/billing/plans.ts` (single source; used by API checks and pricing UI). Credits reset monthly on `current_period_end` (free: calendar month) — unused plan credits do not roll over; purchased top-up credits never expire.

## 2. Credit service

```ts
reserve(workspaceId, amount, { reason, refType, refId }): Promise<Reservation>   // throws INSUFFICIENT_CREDITS
settle(reservationId, actual): Promise<void>   // writes usage_events, decrements balance by actual, marks settled
release(reservationId): Promise<void>
```

- `reserve` in one transaction: `select credits_balance from workspaces where id=$1 for update`; available = balance − sum(held reservations); check spend cap (month-to-date usage + amount ≤ monthly_cap); insert reservation.
- `settle` in one transaction: insert `usage_events(action, credits = actual)`, `update workspaces set credits_balance = credits_balance - actual`, reservation `settled`. Actual may exceed reservation by ≤ 20% (hard stop enforced by job).
- Expired held reservations (> 2 h) released by a cron every 10 min.
- Threshold notifications at `spend_controls.alert_thresholds` % of monthly grant or cap.

## 3. Stripe

| Flow | Implementation |
|---|---|
| Upgrade | `POST /api/billing/checkout { workspaceId, plan: 'pro'|'team', interval: 'month'|'year', seats? }` (owner) → Checkout Session (mode subscription, `client_reference_id = workspaceId`, `customer` reused) → `{ checkoutUrl }` |
| Manage | `POST /api/billing/portal { workspaceId }` → Billing Portal → `{ portalUrl }` |
| Top-up | `POST /api/billing/topup { workspaceId, credits: 100|500|2000 }` → Checkout (mode payment) |
| Webhooks | `checkout.session.completed` (subscription → upsert `subscriptions`, set `workspaces.plan`, grant credits; payment → add credits with `usage_events(action='topup', credits=-n)`), `customer.subscription.updated/deleted` (plan/seats/status; deleted → free at period end), `invoice.paid` (monthly grant reset), `invoice.payment_failed` (status `past_due`, banner) |

Prices from env `STRIPE_PRICE_*`. Tax: Stripe Tax automatic. All webhook handling idempotent by event id.

## 4. API (usage)

| Method | Path | Action | Response |
|---|---|---|---|
| GET | `/api/workspaces/{ws}/usage` | admin | `?from=&to=&groupBy=day|project|action` → `{ balance, monthlyGrant, usedThisPeriod, forecastPeriodEnd, rows: [{ key, credits }] }` |
| GET/PUT | `/api/workspaces/{ws}/spend-controls` | owner | `{ monthlyCap: number|null (> 0), alertThresholds: int[] ascending 1–100 ≤ 5, autoTopup: boolean }` |

Forecast = used so far / elapsed days × period days.

## 5. UI

Usage page: balance card, period progress bar, daily usage bar chart, breakdown tables by project and action, spend controls form (owner), plan card with Upgrade/Manage. Credits meter in sidebar/top bar (amber < 20%, red < 5%). `InsufficientCreditsDialog` on 402 with top-up and upgrade options. Pricing section on marketing site reads `plans.ts`.

## 6. Acceptance criteria

- [ ] Concurrent reservations never overdraw the balance (race test with 20 parallel requests).
- [ ] Failed jobs release reservations; auto-fix retries and visual edits never create usage.
- [ ] Stripe webhooks are idempotent; plan changes reflect within 10 s.
- [ ] Spend cap blocks new reservations and notifies owners.
