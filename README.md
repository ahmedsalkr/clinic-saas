# Clinic management platform

## Platform setup

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor. It creates tenant-scoped clinic, profile, subscription, and record tables, the access policies, and the public logo bucket.
2. In Supabase Auth, leave email/password authentication enabled. Public client sign-up can remain disabled; registrations create accounts through the server using the service-role key.
3. In Stripe, create two recurring per-seat prices (monthly and yearly), enable the customer portal for subscription and seat management, and add a webhook at `https://YOUR_DOMAIN/api/webhooks/stripe` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Copy `.env.example` to `.env.local` and set the Supabase URL, public anon/publishable key, server-only service-role key, public HTTPS URL, Stripe secret and webhook keys, and both recurring price IDs. Never expose or commit the service-role or Stripe secret keys.
5. Deploy the app to a public HTTPS host. Set the same environment variables in the hosting provider and restart/redeploy.
6. Visit `/register` to create a center. The owner chooses a username/password and enters the center's name, phone, and address. The generated center code is used with the owner's email or username and employee usernames for login. New centers receive a one-month trial; Stripe checkout is available to manage the subscription after the trial.

Subscription prices are configured in Stripe rather than hard-coded. Billing is per account seat, including the owner. The owner's billing page opens Stripe's customer portal to renew, change the billing period, and manage seats. Add the configured webhook URL and event types exactly; without the webhook, payment cannot activate access.

For staff created after registration, open **إدارة المستخدمين**. The app enforces the active subscription's seat limit and does not store employee passwords in clinic tables.

## Existing single-clinic data

The schema script assigns existing unscoped records and profiles to a generated legacy center and leaves its subscription `pending`. Existing owners can sign in with their clinic code and email or username, then complete checkout from the billing page. Do not assign multiple pre-existing centers to the same legacy dataset.

## Offline use

The service worker is registered only in production:

```bash
npm install
npm run build
npm start
```

Open the deployed site online and sign in on each device once. Cached pages and that browser's local records remain available offline; new edits queue locally and sync when the app is online again and the subscription is active. User management, account creation, and billing require an internet connection. Test offline behavior against the production server, not `npm run dev`.

## Local checks

```bash
npm run lint
npm run build
```
