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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
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

    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, ACCOUNT_NOTIFICATION_EMAIL } = process.env;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !ACCOUNT_NOTIFICATION_EMAIL) {
        console.error('New-account notification is missing required environment configuration.');
        return res.status(500).json({ error: 'Email notification is not configured.' });
    }

    let userResponse;
    try {
        userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${accessToken}`
            }
        });
    } catch (error) {
        console.error('Unable to verify signup session with Supabase:', error);
        return res.status(502).json({ error: 'Could not verify the new account.' });
    }

    if (!userResponse.ok) return res.status(401).json({ error: 'Invalid authentication session.' });
    let user;
    try {
        user = await userResponse.json();
    } catch (error) {
        console.error('Supabase returned an invalid user response:', error);
        return res.status(502).json({ error: 'Could not verify the new account.' });
    }
    const createdAt = Date.parse(user.created_at);
    if (!user.id || !user.email || !Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000) {
        return res.status(403).json({ error: 'This notification is only available for newly created accounts.' });
    }

    try {
        const name = String(user.user_metadata?.full_name || 'Not provided')
            .replace(/[\r\n\t]/g, ' ')
            .slice(0, 100);
        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `new-account-${user.id}`
            },
            body: JSON.stringify({
                from: RESEND_FROM_EMAIL,
                to: [ACCOUNT_NOTIFICATION_EMAIL],
                subject: 'New Next Level Gaming account',
                text: [
                    'A new account was created on Next Level Gaming.',
                    `Name: ${name}`,
                    `Email: ${user.email}`,
                    `Created: ${user.created_at}`
                ].join('\n')
            })
        });

        if (!emailResponse.ok) {
            console.error('Resend rejected new-account notification:', await emailResponse.text());
            return res.status(502).json({ error: 'The email notification could not be sent.' });
        }

        return res.status(202).json({ ok: true });
    } catch (error) {
        console.error('Unable to send new-account notification:', error);
        return res.status(502).json({ error: 'The email notification could not be sent.' });
    }
};
