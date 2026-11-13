const ALLOWED_ORIGINS = new Set([
    'https://next-level-gaming-arena.vercel.app',
    'http://localhost:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501'
]);

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    const accessToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return res.status(401).json({ error: 'Authentication required.' });

    const {
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        RESEND_API_KEY,
        RESEND_FROM_EMAIL,
        ACCOUNT_NOTIFICATION_EMAIL = 'rossluyanda717@gmail.com',
        EMAILJS_PUBLIC_KEY,
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID
    } = process.env;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        console.error('Supabase configuration missing in environment variables.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Verify authenticated user with Supabase
    let user;
    try {
        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${accessToken}`
            }
        });
        if (!userResponse.ok) {
            return res.status(401).json({ error: 'Invalid authentication session.' });
        }
        user = await userResponse.json();
    } catch (error) {
        console.error('Unable to verify user session with Supabase:', error);
        return res.status(502).json({ error: 'Could not verify user account.' });
    }

    // Read booking payload
    const booking = req.body || {};
    const {
        bookingId = 'N/A',
        firstName = 'Valued Customer',
        surname = '',
        email = user.email,
        phone = 'Not provided',
        experience = 'Gaming Session',
        players = 1,
        hours = 1,
        extras = [],
        subtotal = 0,
        vat = 0,
        total = 0
    } = booking;

    const recipientEmail = (email && email.trim()) || user.email;
    if (!recipientEmail) {
        return res.status(400).json({ error: 'Customer email is required.' });
    }

    // Format extras list
    const extrasList = Array.isArray(extras) && extras.length > 0
        ? extras.map(e => (typeof e === 'object' ? e.name : e)).join(', ')
        : 'None selected';

    const shortId = typeof bookingId === 'string' && bookingId.length > 8 ? bookingId.slice(0, 8) : bookingId;

    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
        const commonParams = {
            to_name: `${firstName} ${surname}`.trim(),
            name: `${firstName} ${surname}`.trim(),
            user_name: `${firstName} ${surname}`.trim(),
            customer_email: recipientEmail,
            user_email: recipientEmail,
            email: recipientEmail,
            customer_phone: phone,
            phone,
            booking_ref: shortId,
            booking_id: shortId,
            experience,
            players,
            hours,
            extras: extrasList,
            subtotal: `R ${Number(subtotal).toFixed(2)}`,
            vat: `R ${Number(vat).toFixed(2)}`,
            total: `R ${Number(total).toFixed(2)}`,
            total_amount: `R ${Number(total).toFixed(2)}`,
            reply_to: recipientEmail
        };

        const sendEmailJs = async (toEmail, toName) => {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: EMAILJS_SERVICE_ID,
                    template_id: EMAILJS_TEMPLATE_ID,
                    user_id: EMAILJS_PUBLIC_KEY,
                    template_params: {
                        ...commonParams,
                        to_email: toEmail,
                        to_name: toName
                    }
                })
            });
            if (!response.ok) {
                const details = await response.text();
                throw new Error(`EmailJS returned ${response.status}: ${details}`);
            }
        };

        const customerEmailPromise = sendEmailJs(recipientEmail, `${firstName} ${surname}`.trim());
        const shouldSendAdminCopy = ACCOUNT_NOTIFICATION_EMAIL.toLowerCase() !== recipientEmail.toLowerCase();
        const adminEmailPromise = shouldSendAdminCopy
            ? sendEmailJs(ACCOUNT_NOTIFICATION_EMAIL, `New booking from ${firstName} ${surname}`.trim())
            : Promise.resolve();
        const [customerResult, adminResult] = await Promise.allSettled([customerEmailPromise, adminEmailPromise]);
        const customerSent = customerResult.status === 'fulfilled';
        const adminSent = adminResult.status === 'fulfilled';

        if (!customerSent) console.error('EmailJS customer quotation failed:', customerResult.reason);
        if (shouldSendAdminCopy && !adminSent) console.error('EmailJS admin booking notification failed:', adminResult.reason);

        if (customerSent && adminSent) {
            return res.status(202).json({ ok: true, customerSent, adminSent: true });
        }

        return res.status(502).json({
            error: 'The booking was saved, but one or more quotation emails could not be sent.',
            customerSent,
            adminSent: shouldSendAdminCopy ? adminSent : null
        });
    }

    // Check if Resend email service is configured
    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
        console.error('Booking email is not configured. Set EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, and EMAILJS_TEMPLATE_ID or configure Resend.');
        return res.status(503).json({
            error: 'The booking was saved, but email delivery is not configured on the server.'
        });
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #141414; border: 1px solid #c40000; border-radius: 8px; padding: 30px; }
    .header { text-align: center; border-bottom: 2px solid #c40000; padding-bottom: 20px; margin-bottom: 25px; }
    .logo-main { font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff; }
    .logo-sub { font-size: 11px; font-weight: 700; color: #c40000; letter-spacing: 1.5px; }
    h2 { color: #ffffff; font-size: 20px; margin-top: 0; }
    p { color: #cccccc; font-size: 15px; line-height: 1.6; }
    .quote-box { background: #1f1f1f; border-left: 4px solid #c40000; padding: 15px 20px; margin: 20px 0; border-radius: 4px; }
    .quote-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #bbb; }
    .quote-row strong { color: #fff; }
    .total-row { border-top: 1px solid #333; padding-top: 10px; margin-top: 10px; font-size: 18px; color: #c40000; font-weight: 900; }
    .contact-note { background: rgba(196, 0, 0, 0.1); border: 1px solid rgba(196,0,0,0.3); padding: 15px; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #222; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-main">NEXT LEVEL</div>
      <div class="logo-sub">GAMING &amp; ESPORTS ARENA</div>
    </div>

    <h2>QUOTATION REQUEST RECEIVED</h2>
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Thank you for submitting your booking request with <strong>Next Level Gaming</strong>. We have received your details and our team will be in touch shortly with your quotation.</p>

    <div class="quote-box">
      <div class="quote-row"><span>Booking Reference:</span> <strong>#${shortId}</strong></div>
      <div class="quote-row"><span>Experience:</span> <strong>${experience}</strong></div>
      <div class="quote-row"><span>Players:</span> <strong>${players}</strong></div>
      <div class="quote-row"><span>Duration:</span> <strong>${hours} hour(s)</strong></div>
      <div class="quote-row"><span>Optional Extras:</span> <strong>${extrasList}</strong></div>
      <div class="quote-row"><span>Subtotal:</span> <strong>R ${Number(subtotal).toFixed(2)}</strong></div>
      <div class="quote-row"><span>VAT (15%):</span> <strong>R ${Number(vat).toFixed(2)}</strong></div>
      <div class="quote-row total-row"><span>Estimated Total:</span> <span>R ${Number(total).toFixed(2)}</span></div>
    </div>

    <div class="contact-note">
      <p style="margin: 0; color: #fff; font-weight: bold;">What happens next?</p>
      <p style="margin: 5px 0 0; color: #ccc; font-size: 14px;">
        Our team will contact you at <strong>${phone}</strong> or by replying to this email to confirm your preferred time slot and finalize your quotation details.
      </p>
    </div>

    <p>You can also log in to your Next Level Gaming account from any device to view your active bookings and order history in your <a href="https://next-level-gaming-arena.vercel.app/profile.html" style="color: #c40000;">Player Profile</a>.</p>

    <div class="footer">
      &copy; Next Level Gaming &amp; Esports Arena. All rights reserved.
    </div>
  </div>
</body>
</html>
    `;

    const emailText = [
        'NEXT LEVEL GAMING & ESPORTS ARENA',
        '---------------------------------',
        `Hi ${firstName},`,
        '',
        'Thank you for requesting a booking! We have received your details and our team will be in touch with your quotation shortly.',
        '',
        'QUOTATION DETAILS:',
        `- Booking Ref: #${shortId}`,
        `- Experience: ${experience}`,
        `- Players: ${players}`,
        `- Duration: ${hours} hour(s)`,
        `- Extras: ${extrasList}`,
        `- Subtotal: R ${Number(subtotal).toFixed(2)}`,
        `- VAT (15%): R ${Number(vat).toFixed(2)}`,
        `- Estimated Total: R ${Number(total).toFixed(2)}`,
        '',
        `We will contact you at ${phone} or via email to confirm your time slot and finalize your quotation.`,
        '',
        'You can view your bookings anytime at: https://next-level-gaming-arena.vercel.app/profile.html',
        '',
        'Next Level Gaming Team'
    ].join('\n');

    try {
        // Send email to customer
        const customerEmailPromise = fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `booking-customer-${bookingId}`
            },
            body: JSON.stringify({
                from: RESEND_FROM_EMAIL,
                to: [recipientEmail],
                subject: `Your Next Level Gaming Quotation Request (#${shortId})`,
                text: emailText,
                html: emailHtml
            })
        });

        // Send alert to admin
        const adminEmailPromise = fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `booking-admin-${bookingId}`
            },
            body: JSON.stringify({
                from: RESEND_FROM_EMAIL,
                to: [ACCOUNT_NOTIFICATION_EMAIL],
                subject: `New Booking Quotation: ${experience} by ${firstName} ${surname} (R ${Number(total).toFixed(2)})`,
                text: [
                    'NEW BOOKING QUOTATION REQUEST',
                    '-----------------------------',
                    `Customer: ${firstName} ${surname}`,
                    `Email: ${recipientEmail}`,
                    `Phone: ${phone}`,
                    `Experience: ${experience}`,
                    `Players: ${players}`,
                    `Hours: ${hours}`,
                    `Extras: ${extrasList}`,
                    `Estimated Total: R ${Number(total).toFixed(2)}`,
                    `Booking Ref: ${bookingId}`,
                    `User ID: ${user.id}`
                ].join('\n')
            })
        });

        const [custRes, adminRes] = await Promise.all([customerEmailPromise, adminEmailPromise]);

        const customerSent = custRes.ok;
        const adminSent = adminRes.ok;
        if (!customerSent) console.error('Customer email delivery error:', await custRes.text());
        if (!adminSent) console.error('Admin email delivery error:', await adminRes.text());

        if (customerSent && adminSent) {
            return res.status(202).json({ ok: true, customerSent, adminSent: true });
        }
        return res.status(502).json({
            error: 'The booking was saved, but one or more quotation emails could not be sent.',
            customerSent,
            adminSent
        });
    } catch (error) {
        console.error('Unable to send booking emails:', error);
        return res.status(502).json({ error: 'The email notification could not be sent.' });
    }
};
