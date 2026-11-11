# SAHAASRA website

The public website for SAHAASRA: home (features and industries), pricing, contact, and the terms, privacy and
refund pages that PayU checks. Built with React, TypeScript, Tailwind CSS and Vite.

- **Login** opens `APP_URL/login` in the SAHAASRA software.
- **Sign up** opens `APP_URL/signup`, where anyone can create a business account.
- **Get started** on the pricing page opens sign-up with the period already chosen (`/signup?plan=build&period=yearly`).
- No payment is taken on the website. After signing up, customers buy the plan inside the software (PayU hosted checkout).

## Edit

All settings are in [src/config.ts](src/config.ts):

- `APP_URL` is the address of the SAHAASRA software (`https://app.sahaasra.in`). `VITE_APP_URL` overrides it at build time.
- `COMPANY` holds the legal name, registered address, support email and phone, GSTIN and support hours.
- `PLANS` holds the prices shown on the website. The amount actually charged comes from
  `backend/src/lib/subscription.ts`, so keep the two the same.

Pages are in [src/pages](src/pages), the header and footer in [src/components/Layout.tsx](src/components/Layout.tsx).

## Run and build

```
cd website
npm install
npm run dev      # http://localhost:5180
npm run build    # output in website/dist
```

## Hosting

On our server, `deploy/vps/deploy.sh` builds it and nginx serves `website/dist` at https://sahaasra.in
(see [deploy/vps/README.md](../deploy/vps/README.md)). Every path falls back to `index.html`.
