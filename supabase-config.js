(function () {
  const SUPABASE_URL = "https://nbpvamrwzqrgoiwpadwc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5icHZhbXJ3enFyZ29pd3BhZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTcwNDgsImV4cCI6MjEwMDgzMzA0OH0.2CQhyBhbQ7SYAXDuMqnO5qNhiIBpx4jxvDUtwyCGlpQ";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("SOLITAIRE: supabase-js failed to load before supabase-config.js");
    return;
  }

  window.SolitaireDB = {
    sb: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  };
})();
