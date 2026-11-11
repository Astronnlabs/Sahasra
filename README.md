# SAHAASRA

**Everything Your Business Needs. In One Place.**

A business operating system for Indian businesses: POS billing, inventory, purchases, customers and vendors, expenses, GST, staff, attendance and payroll, reports, industry modules (restaurant, hotel, salon, jewellery, pharmacy) and Bill Studio, plus a Super Admin portal to run the platform.

- **Web app**: React 18, TypeScript, Vite, Tailwind, TanStack Query (`/src`)
- **API server**: Node.js, Express 5, Prisma, PostgreSQL (`/backend`)

Every number on screen comes from the database. There is no sample or demo data. A fresh installation starts completely empty.

## Running it locally

You need **Node.js 20+** and **PostgreSQL 14+**.

### 1. Database

Create a database and a user for SAHAASRA (in `psql` as a superuser):

```sql
CREATE ROLE sahaasra LOGIN PASSWORD 'choose-a-strong-password' CREATEDB;
CREATE DATABASE sahaasra OWNER sahaasra;
```

### 2. API server

```bash
cd backend
cp .env.example .env          # then set DATABASE_URL with the password you chose
npm install
npm run db:deploy             # creates the tables
npm run dev                   # http://localhost:4000
```

### 3. Web app

```bash
npm install                   # in the project root
npm run dev                   # http://localhost:5173 (requests to /api are proxied to port 4000)
```

### 4. First run

Open http://localhost:5173. On an empty database you are taken to **Set up SAHAASRA**, where you create the **platform owner (Super Admin)** account. This only works once. After that the page redirects to sign-in.

## Accounts and sign-in

- People sign in with their **email or mobile number** and password. Passwords are hashed with bcrypt. Sessions are server-side, using an httpOnly cookie (30 days with "Keep me signed in", otherwise 12 hours).
- **Businesses** are created by the Super Admin (**Businesses → Add business**) or by the owner through **Create your business** (a 14-day trial).
- When the Super Admin or an owner creates a login, SAHAASRA shows a **one-time temporary password** to share with that person. No emails or SMS are sent. The person changes it under **Settings → Security**.
- **Forgot password**: staff ask their owner or admin (**Users → Reset password**). Owners ask Sahaasra support (Super Admin → business → **Reset owner password**).

## Super Admin portal (`/superadmin`)

- **Overview** and **Growth**: businesses, new sign-ups, active users, MRR and the support queue, all computed live.
- **Businesses**: full business details, **live location capture** (latitude, longitude, altitude, accuracy), owner details, plan, and **page access**. You can grant or remove pages at any time. The server enforces access on every request.
- From a business you can change the plan, extend a trial, suspend or reactivate it (suspending signs its users out), reset the owner's password, and open it in **support mode**. Every action in support mode is audit-logged as "(Sahaasra Support)".
- **Users**: logins across all businesses (create, suspend, reset password).
- **Support**: the ticket inbox, with replies, internal notes, status, priority and assignee. Replies notify the business.

## What the server enforces

- **Tenant isolation**: every query is scoped to the signed-in user's business.
- **Page access** set by the Super Admin, and **role permissions** (view, create, edit, delete, approve, export, refund, discount, view profit) set by the business under **Roles**.
- **POS prices, tax and totals are recomputed on the server** from the catalogue. Invoice numbers are sequential and never repeat, using the prefix and start number from **Settings → Invoice Settings**. Staff discounts are capped by **Settings → Billing & POS**.
- Stock moves with every sale, refund, return, purchase receipt and adjustment, and each change is recorded in stock history.
- CSRF protection (custom header on every change), rate-limited sign-in, upload type checks (PNG, JPG, WebP, PDF, up to 5 MB), and an audit log of changes.

## Real-world integrations

- **UPI**: add your UPI ID under **Settings → Payments**. POS and invoices show a scannable UPI QR for the exact amount due. Confirm the payment in your UPI app before pressing Confirm.
- **Invoices** print through the browser using your default **Bill Studio** template. Choose "Save as PDF" in the print dialog to download.
- **WhatsApp** buttons open WhatsApp with a pre-filled message (invoice or payment reminder). You press Send.
- **GST**: registers, HSN summary and the GSTR-3B tax summary export as CSV or JSON for the GST portal or your CA. SAHAASRA does not file returns.
- **Data export**: **Settings → Your data** downloads everything as JSON.

## Project layout

```
backend/
  prisma/schema.prisma   database schema and migrations
  src/routes/            auth, workspace, catalogue, transactions, people, industry, admin, analytics, platform
  src/analytics/         dashboard, reports, GST, assistant and search, computed from the database
  src/middleware/        sessions, page access, role permissions, CSRF
src/
  services/api/          typed API client; UI code imports data access only from `@/services`
  app/                   providers (auth session, workspace, theme), router, configuration
  features/              one folder per module
```

Useful backend scripts: `npm run typecheck`, `npm run build`, `npm start` (production; also serves the built web app from `/dist`), `npm run db:studio`.
