# Clinic management platform

## Platform setup

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL Editor. It creates tenant-scoped clinic, profile, subscription (retained for future billing), and record tables, the access policies, and the public logo bucket.
2. In Supabase Auth, leave email/password authentication enabled. Public client sign-up can remain disabled; registrations create accounts through the server using the service-role key.
3. Copy `.env.example` to `.env.local` and set the Supabase URL, public anon/publishable key, and server-only service-role key. Never expose or commit the service-role key.
4. Deploy the app to a public HTTPS host. Set the same environment variables in the hosting provider and restart/redeploy.
5. Visit `/register` to create a center. The owner chooses a username/password and enters the center's name, phone, and address. The generated center code is used with the owner's email or username and employee usernames for login. New centers are available immediately without a trial or payment.

Stripe checkout and webhook processing are disabled. The billing schema and Stripe helper files remain in place for possible future reactivation.
For staff created after registration, open **إدارة المستخدمين**. Employee passwords are not stored in clinic tables.

## Existing single-clinic data

The schema script assigns existing unscoped records and profiles to a generated legacy center. Existing owners can sign in with their clinic code and email or username. Do not assign multiple pre-existing centers to the same legacy dataset.

## Offline use

The service worker is registered only in production:

```bash
npm install
npm run build
npm start
```

Open the deployed site online and sign in on each device once. Cached pages and that browser's local records remain available offline; new edits queue locally and sync when the app is online again. User management and account creation require an internet connection. Test offline behavior against the production server, not `npm run dev`.

## Local checks

```bash
npm run lint
npm run build
```
