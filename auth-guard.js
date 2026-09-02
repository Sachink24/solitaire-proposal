/* ============================================================================
   SOLITAIRE — Auth guard
   Drop this <script> tag (with a data-page-role attribute, informational only
   — pages do their own role check) on every protected page, AFTER
   supabase-config.js. It:
     1. Reads the current Supabase Auth session (real supabase.auth session,
        so auth.uid() works correctly in RLS policies across all tables).
     2. Loads the matching row from public.users via auth_user_id = auth.uid().
     3. Exposes window.SolitaireAuth = { session, user, profile } once ready.
     4. Redirects to login.html (with ?next=) if there's no session, no
        matching users row, or the account isn't status = 'active'.
     5. Renders a "Signed in as ... / Sign out" control into any element with
        id="topbarActions", if present on the page.
   Pages themselves still do their own role check (admin/owner) against
   window.SolitaireAuth.profile.role — this file only proves *who* is signed
   in, not *what* they're allowed to see.
   ========================================================================== */
(function () {
  const LOGIN_PAGE = "login.html";

  function currentPageForNext() {
    return encodeURIComponent(location.pathname.split("/").pop() || "index.html");
  }

  function goToLogin(reason) {
    const url = LOGIN_PAGE + "?next=" + currentPageForNext() + (reason ? "&reason=" + encodeURIComponent(reason) : "");
    location.replace(url);
  }

  function renderTopbarActions(profile) {
    const el = document.getElementById("topbarActions");
    if (!el) return;
    const label = (profile && (profile.name || profile.email)) || "Signed in";
    el.innerHTML = `
      <span style="font-size:11.5px;color:var(--ink-faint,#9BA3AE);margin-right:10px;">${label}</span>
      <button id="sfmLogoutBtn" class="btn btn-ghost" style="padding:8px 12px;">Sign out</button>
    `;
    const btn = document.getElementById("sfmLogoutBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        const sb = window.SolitaireDB && window.SolitaireDB.sb;
        if (sb) await sb.auth.signOut();
        goToLogin();
      });
    }
  }

  async function init() {
    const sb = window.SolitaireDB && window.SolitaireDB.sb;
    if (!sb) {
      console.error("SOLITAIRE auth-guard: SolitaireDB.sb not found — check supabase-config.js loaded first.");
      goToLogin("config-missing");
      return;
    }

    const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session) {
      goToLogin();
      return;
    }
    const session = sessionData.session;
    const user = session.user;

    const { data: profile, error: profileErr } = await sb
      .from("users")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("SOLITAIRE auth-guard: failed to load profile", profileErr);
      goToLogin("profile-error");
      return;
    }
    if (!profile) {
      // Signed in with Supabase Auth but no linked row in public.users yet —
      // this account hasn't been provisioned. Sign out rather than leaving
      // them stuck in limbo with no role/name to show.
      await sb.auth.signOut();
      goToLogin("not-provisioned");
      return;
    }
    if (profile.status && profile.status !== "active") {
      await sb.auth.signOut();
      goToLogin("inactive");
      return;
    }

    window.SolitaireAuth = { session, user, profile };
    renderTopbarActions(profile);

    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") goToLogin();
    });

    // Let pages that were already polling for window.SolitaireAuth know it's ready.
    document.dispatchEvent(new CustomEvent("solitaire-auth-ready", { detail: window.SolitaireAuth }));
  }

  init();
})();
