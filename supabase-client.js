const SUPABASE_URL = "https://fhqoeawzgqwikliqghzq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hMuDkFNHIpm2cMHM4BlXVQ_Dsxdig0u";

if (!window.supabase) {
    throw new Error("Supabase SDK did not load. Check your internet connection and CDN access.");
}

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

// Helper to quickly retrieve current user & session
window.getSupabaseSession = async function() {
    try {
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        if (error) {
            console.warn("Could not get Supabase session:", error);
            return null;
        }
        return session;
    } catch (err) {
        console.warn("Supabase auth check failed:", err);
        return null;
    }
};

// Update nav links to reflect login/logout status
window.updateNavAuthStatus = async function() {
    try {
        const session = await window.getSupabaseSession();
        const user = session?.user;
        const loginLinks = document.querySelectorAll('a[href="login.html"], a[href="login.html?next=profile.html"]');

        loginLinks.forEach(link => {
            if (user) {
                link.textContent = "MY PROFILE";
                link.setAttribute("href", "profile.html");
                link.setAttribute("title", `Signed in as ${user.email}`);
            } else {
                link.textContent = "LOG IN / SIGN UP";
                link.setAttribute("href", "login.html");
                link.removeAttribute("title");
            }
        });
    } catch (err) {
        console.warn("Error updating nav auth status:", err);
    }
};

// Automatically run nav update and listen for auth state changes
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.updateNavAuthStatus);
    } else {
        window.updateNavAuthStatus();
    }

    window.supabaseClient.auth.onAuthStateChange(() => {
        window.updateNavAuthStatus();
    });
}
