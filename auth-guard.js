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

    document.dispatchEvent(new CustomEvent("solitaire-auth-ready", { detail: window.SolitaireAuth }));
  }

  init();
})();
