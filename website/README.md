# SAHASRA website

The public website for SAHASRA: home (features and industries), pricing, contact, and the terms, privacy and refund pages that PayU checks.
It is plain HTML and CSS with no build step.

- **Login** opens `APP_URL/login` in the SAHASRA software.
- **Sign up** opens `APP_URL/signup`, where anyone can create a business account.
- **Get started** on the pricing page opens sign-up with the period already chosen (`/signup?plan=build&period=yearly`).
- No payment is taken on the website. After signing up, customers buy the plan inside the software (PayU hosted checkout).

## Edit

All settings are in [assets/config.js](assets/config.js):

- `APP_URL` is the address of the SAHASRA software.
- `COMPANY` holds the legal name, registered address, support email and phone, and GSTIN. These show on the Contact and policy pages.
- `PLANS` holds the prices shown on the website. The amount actually charged comes from `backend/src/lib/subscription.ts`, so keep the two the same.

## Preview

Open `index.html` in a browser, or run `npx serve website` from the project folder.

## Deploy (Render static site)

1. In Render, go to New → Static Site and pick this repository.
2. Set the root directory to `website`.
3. Leave the build command empty and set the publish directory to `.`.
4. Optional: add your own domain (for example `sahasra.in`) under Settings → Custom Domains.

Vercel and Netlify work the same way: point them at the `website` folder with no build command.
