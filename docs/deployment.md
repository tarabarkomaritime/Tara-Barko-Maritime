# Deployment

The whole thing is static files. There is no build step, no bundler and no package manager.

---

## Local

### Option A — serve the folder (recommended)

```bash
npx --yes serve -l 4173 .
```

- Public portal — <http://localhost:4173/register.html>
- Internal system — <http://localhost:4173/index.html>

Any static server works: `python -m http.server 4173`, `php -S localhost:4173`, VS Code's Live
Server. The port does not matter.

**Serve it rather than double-clicking.** Both pages must share one origin to share one
`localStorage`, and the cross-tab live sync depends on it.

### Option B — open the files directly

Double-click `index.html`. This works, but some browsers partition `file://` storage per
document, which gives the two pages separate databases. Fine for demonstrating one page at a
time; confusing otherwise.

### Tests

```bash
node tests/smoke.js
```

Any recent Node. Built-in modules only.

---

## Hosting the prototype

Suitable for a demo, a client review or internal validation. **Not for real applicant data** —
see section 4 of [`ACTION-PLAN.md`](../ACTION-PLAN.md).

Any static host serves it as-is: Netlify, Vercel, GitHub Pages, Cloudflare Pages, or a plain
Apache/nginx directory. Drop the folder in. There is nothing to configure.

Two things to get right:

1. **Put `index.html` behind access control.** It is the staff system, and its login is a
   plaintext demo code. HTTP basic auth at the edge, an IP allowlist, or a private URL —
   anything is better than nothing.
2. **Make `register.html` the public entry point.** Either set it as the index, or link to it
   from the center's existing website. Do not advertise `index.html`.

### Suggested nginx sketch

```nginx
server {
    root /var/www/tarabarko;
    index register.html;

    location = / { return 302 /register.html; }

    location = /index.html {
        auth_basic "Tara Barko staff";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

`assets/` must stay readable to both — the two pages share `db.js`, `ui.js`, `accounting.js`
and `applications.js`.

### Cache headers

There is no content hashing in the filenames, so an aggressive cache will serve stale JS after
an update. Either set a short `max-age` on `assets/*`, or add a query string when you deploy
(`db.js?v=2`) — in which case update it in **both** HTML files.

---

## Data, backup and restore

Everything lives in `localStorage` under one key, `tbm_is_v1`, scoped to the origin.

| Action | How |
|---|---|
| Back up | Internal system → **Backup** in the top bar. Downloads `TBM-backup-YYYY-MM-DD.json`. |
| Restore | **Restore** → pick the file. Old backups missing newer collections still open — `DB.migrate()` fills the defaults. |
| Erase | Sign in as admin → Settings → erase all records. Irreversible. |
| Re-seed | Erase, then reload. The seed only runs on an empty store. |

**Back up before every demo.** Clearing site data, using a different browser or a different
profile all mean starting from zero. This is limitation B1, and it is the main reason Phase 2
exists.

---

## Phase 2 — what changes

When the backend lands, the deployment shape changes:

| | Now | Phase 2 |
|---|---|---|
| Data | `localStorage`, per browser | Postgres (Supabase recommended) |
| Auth | Plaintext codes in `db.js` | Real authentication with sessions |
| Permissions | Client-side `PERMS` | Row-level security, matching the same matrix |
| Backup | Manual JSON download | Automated database backups with restore drills |
| Hosting | Static folder | Static frontend plus an API — the frontend can stay a static host |
| Config | Hard-coded defaults | Environment variables, with the demo seed behind a flag |

`assets/db.js` is the only module that touches storage, so the frontend change is one file.
Keep it that way.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Portal and internal system show different data | Different origins — one on `file://`, one on `http://`; or different ports | Serve both from the same origin |
| Changes to `seed()` do not appear | The seed only runs on an empty store | Erase all records, then reload |
| Cross-tab sync does nothing | Different origins, or the same tab | Same origin, two tabs |
| `DB is not defined` in the console | Script order broke | Order must be `db.js → ui.js → accounting.js → applications.js → app.js`/`register.js` |
| Stale behaviour after deploying | Cached `assets/*` | Hard reload; then fix your cache headers |
| Everything vanished | Site data cleared, or a different browser profile | Restore from a backup — this is B1 |
