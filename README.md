# Knaffla Family

The family's front door at https://kknaffla.github.io/. Sign in once and every family page (including the college plan at /college-plan/) shares the sign-in, because they use the same Supabase project on the same address.

Code only. No family data lives in this repo; everything is behind the sign-in and the database's row-level security. The key in `config.js` is the public "anon" key.

Deploy: commit to `main`; GitHub Pages serves the repo root. Bump `APP_VERSION` in `app.js` and the `?v=` tags in `index.html` on each change.
