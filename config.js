// Fill these two values from Supabase → Project Settings → API (README step 3).
// The "anon"/"publishable" key is designed to be public: the database's
// row-level security rules are what keep the data private.
// NEVER put the "service_role"/"secret" key here.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://qienshgabtzngzerjkrl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZW5zaGdhYnR6bmd6ZXJqa3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzEwMTcsImV4cCI6MjEwODU0NzAxN30.a9Zl9-mnnt05rianl0BIRynjwnsB_pw1veCFL_A5dpY',
  TIME_ZONE: 'America/Detroit',
  // Next election shown on the dashboard. The yearly voter-guide task updates these.
  ELECTION: { name: 'Michigan General Election', date: '2026-11-03', guide: 'https://claude.ai/artifact/Txfd7WZZx21rxuQW8G6zw3' }
};
