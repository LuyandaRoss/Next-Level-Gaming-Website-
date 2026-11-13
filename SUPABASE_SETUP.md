# Next Level Gaming - Supabase & Booking Setup Guide

This guide explains how Supabase Authentication, cross-device credentials, user profile saving, and booking quotation email notifications work together.

---

## 1. Supabase Authentication & Central Credentials

Users can create an account or log in from **any device** (PC, phone, tablet) and access their profile and bookings.

### Critical Supabase Dashboard Setting: Turn OFF "Confirm email"

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** (left sidebar) &rarr; **Providers** &rarr; **Email**.
3. Toggle **Confirm email** to **OFF** (Disabled).
4. Click **Save**.

> **Why this is essential:**  
> When "Confirm email" is enabled, Supabase requires new users to click an email verification link before logging in. Supabase's default mailer is strictly limited to 3-4 emails per hour across your whole project, causing `email rate limit exceeded` errors.  
> Turning OFF "Confirm email" allows users to sign up and **immediately sign in**, saving their profile and accessing the site from any device without delay.

---

## 2. Database Schema & Information Storage

The database tables are hosted in your Supabase project:
- **`profiles`**: Stores each player's `full_name` and `phone`, linked directly to their Supabase user ID.
- **`bookings`**: Stores quotation requests (Experience, Players, Hours, Extras, Subtotal, VAT, Total, and Status).
- **`checkout_orders`**: Stores demo orders and membership transactions.
- **`membership_subscriptions`**: Stores VIP membership passes.
- **`contact_messages`**: Stores inquiries submitted via the Contact Us page.

### Automatic Profile Creation
When a new user signs up on `login.html`, a database trigger (`create_profile_for_new_user`) automatically creates a row in `public.profiles`. When they update their profile on `profile.html` or submit a booking, their latest name and phone number are automatically synchronized.

---

## 3. Booking System & Quotation Email

### How it works:
1. When a signed-in user opens `booking.html`, their **Name, Email, and Phone number are automatically pre-filled** from their Supabase profile.
2. The user selects their experience (PC Gaming, Console Gaming, or Esports Arena), players, hours, and optional extras. The live quotation calculates in real-time.
3. If a visitor is not logged in yet, clicking "Submit" saves their form selections in browser storage and prompts them to log in or create an account, so **no form inputs are lost**.
4. When they submit:
   - The booking is inserted into Supabase `bookings` with status `'pending'`.
   - Their profile is updated with their latest contact details.
   - The serverless function `/api/booking-notification` sends a quotation email to the customer and a booking alert to the venue with:
     - Reference number
     - Complete quotation breakdown (Experience, Players, Duration, Extras, Total)
     - A promise that the team will be in touch shortly to finalize their quotation and booking.
   - An alert email is also sent to `rossluyanda717@gmail.com` with the customer details and quote.
   - The website displays a confirmation screen with one-click access to view the booking in their **Player Profile**.

---

## 4. Email Delivery (EmailJS)

Booking emails are sent by the Vercel serverless function `/api/booking-notification`. It reads `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, and `EMAILJS_TEMPLATE_ID` from server environment variables, and sends a quotation to the customer plus a booking alert to the venue. Set the EmailJS template's **To Email** field to `{{to_email}}` so it can address both messages.

The app also stores the preferred booking date and time, special request, and booking reference in the same `bookings` table. Apply `supabase/migrations/202611090001_mobile_booking_details.sql` in the Supabase SQL Editor if the database was created before these fields were added.

The root `.env` file is local configuration; Vercel does not automatically read it when deploying. Import it under Vercel **Project Settings → Environment Variables** for Production, verify those three EmailJS variable names are present, and redeploy. Membership order notifications also require `EMAILJS_ORDER_TEMPLATE_ID` and use `/api/order-notification`. Do not paste API keys or secrets into chat.

See `EMAILJS_SETUP.md` for creating the EmailJS service and template.

## 5. Booking and Payment Status

Submitting a booking creates a quotation request with status `pending`. It does not charge the customer or process a payment. Player Profile identifies this as a pending quote, not a payment status. Checkout is a separate demo flow that records pending orders only.

---

## 6. Testing Checklist

1. **Sign Up**:
   - Go to `login.html`, click **CREATE AN ACCOUNT**, enter Name, Email, and Password (min 8 characters).
   - If "Confirm email" is disabled in Supabase, you are signed in immediately and redirected.
2. **Access From Another Device / Browser**:
   - Open an incognito window or your phone browser.
   - Go to `login.html`, switch to **LOG IN**, and enter the same email and password.
   - Your account and previous activity will be right there.
3. **Player Profile**:
   - Visit `profile.html` to view your details.
   - Click **EDIT PROFILE** to change your name or phone number and click **SAVE CHANGES**.
4. **Booking & Live Quotation**:
   - Go to `booking.html`. Notice your name, email, and phone are pre-filled automatically!
   - Select your experience, players, hours, and extras.
   - Click **SUBMIT BOOKING & REQUEST QUOTATION**.
   - See the confirmation screen with your quotation summary and booking reference.
   - Check `profile.html` &mdash; your new booking will appear under **YOUR BOOKINGS & QUOTATIONS**.
