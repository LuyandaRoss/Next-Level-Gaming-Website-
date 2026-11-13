# EmailJS Setup Guide for Next Level Gaming

EmailJS delivers booking quotation emails through the Vercel serverless endpoint. The contact form still uses the browser EmailJS client.

---

## Step 1: Create a Free Account
1. Go to **[https://www.emailjs.com/](https://www.emailjs.com/)** and click **Sign Up Free**.
2. Free tier gives you **200 emails per month**, which is plenty for booking requests.

---

## Step 2: Connect Your Email Service
1. In your EmailJS Dashboard, click **Email Services** in the left sidebar.
2. Click **Add New Service**.
3. Choose your email provider (e.g., **Gmail**, **Outlook**, or **Yahoo**).
4. Click **Connect Account** and sign in with your email (`rossluyanda717@gmail.com` or your gaming business email).
5. Copy your **Service ID** (for example: `service_abc123`).

---

## Step 3: Create the Booking Quotation Template
1. In the left sidebar, click **Email Templates** &rarr; **Create New Template**.
2. In the template editor:
   - **To Email:** `{{to_email}}`
   - **From Name:** `Next Level Gaming`
   - **Subject:** `Your Next Level Gaming Quotation Request (#{{booking_ref}})`
3. In the email body, paste:

```html
Hi {{to_name}},

Thank you for your booking request with Next Level Gaming & Esports Arena!
We have received your details and our team will be in touch with your quotation shortly.

QUOTATION SUMMARY:
- Booking Reference: #{{booking_ref}}
- Experience: {{experience}}
- Players: {{players}} player(s)
- Duration: {{hours}} hour(s)
- Optional Extras: {{extras}}
- Subtotal: {{subtotal}}
- VAT (15%): {{vat}}
- Estimated Total: {{total}}

Our team will contact you at {{customer_phone}} or reply directly to this email to finalize your time slot and quotation.

Best regards,
Next Level Gaming Team
```

4. Click **Save** in the top right.
5. Copy your **Template ID** (for example: `template_xyz789`).

---

## Step 4: Get Your Public Key
1. In the left sidebar, click **Account** &rarr; **General**.
2. Find the **Public Key** field and copy it (for example: `user_xxxxxxxxxxxxxxxx`).

---

## Step 5: Configure Booking Emails in Vercel

The booking email endpoint needs these environment variables:

- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `ACCOUNT_NOTIFICATION_EMAIL`

Add them to your local `.env`, then import that file in Vercel under **Project Settings → Environment Variables** for Production. Redeploy after importing. The local `.env` file is not automatically sent to Vercel.

The EmailJS template's **To Email** field must be `{{to_email}}`; the server uses it to send one email to the customer and one booking alert to the venue.

## Step 6: Configure Contact Form Keys in `emailjs-config.js`

Open the file [`emailjs-config.js`](file:///c:/Users/User/Next%20Level%20Gaming%20Website/Next%20Level%20Gaming/emailjs-config.js) in your project and update the three fields:

```javascript
const EMAILJS_CONFIG = {
    publicKey: "PASTE_YOUR_PUBLIC_KEY_HERE",
    serviceId: "PASTE_YOUR_SERVICE_ID_HERE",
    templateId: "PASTE_YOUR_TEMPLATE_ID_HERE",
    adminTemplateId: "",   // Optional: template ID if you want an alert sent to admin
    contactTemplateId: "" // Optional: template ID for contact.html form messages
};
```

---

## Step 7: Test Your Booking Email
1. Open [`booking.html`](file:///c:/Users/User/Next%20Level%20Gaming%20Website/Next%20Level%20Gaming/booking.html) in your browser.
2. Sign in to your account.
3. Select an experience (e.g. PC Gaming), players, and hours.
4. Click **SUBMIT BOOKING & REQUEST QUOTATION**.
5. Your booking is saved in Supabase. EmailJS sends a quotation to the customer and a booking alert to the venue. The confirmation page reports if either email fails.

## Step 8: Configure Membership Order Emails

Membership orders use the server-only `/api/order-notification` endpoint. Create a second EmailJS template so membership requests are not described as bookings:

- **To Email:** `{{to_email}}`
- **Subject:** `Next Level Gaming order received · {{order_reference}}`
- Include `{{to_name}}`, `{{order_item}}`, `{{order_status}}`, `{{total_amount}}`, and `{{billing_period}}` in the message.

Set the template ID as the Vercel environment variable `EMAILJS_ORDER_TEMPLATE_ID` for Production and redeploy. The endpoint loads the saved record from Supabase using the signed-in user's token, then sends customer and venue messages concurrently. Never put this template or any EmailJS key in the mobile app.

Because EmailJS previously returned HTTP 403 for server-side requests, also open **Account → Security** in EmailJS and enable **API access from non-browser environments** before testing the Vercel endpoint.
