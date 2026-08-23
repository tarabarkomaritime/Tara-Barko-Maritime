# Putting this online

Three separate things, in the order they have to happen. Only the first two are
needed to have the system running on the internet; the third changes how it
stores data and can wait.

---

## 1. GitHub — a private repository

The repository holds the office's staff names and, until they are changed, the
three sign-in codes in `assets/db.js`. It should be **private**.

Create an empty repository at <https://github.com/new> — no README, no
`.gitignore`, no licence, or the first push will be rejected as a conflict.
Then, in this folder:

```bash
git remote add origin https://github.com/YOUR-NAME/tara-barko-maritime.git
git push -u origin main
```

Windows will ask you to sign in to GitHub once, in a browser window. After that
`git push` is enough.

---

## 2. Vercel — the system on the internet

The site is plain HTML, CSS and JavaScript with no build step, so Vercel needs
no configuration at all. Do not add a framework preset; leave the build command
empty and the output directory as the repository root.

1. Sign in to <https://vercel.com> with the same GitHub account.
2. **Add New → Project**, pick the repository, press **Deploy**.

Two pages come out of it:

| Page                | Address                     |
| ------------------- | --------------------------- |
| Internal system     | `https://your-project.vercel.app/`             |
| Public registration | `https://your-project.vercel.app/register.html` |

Every push to `main` redeploys by itself.

**What being online does not change:** the data still lives in whichever browser
opened the page. Kyla on her laptop and Jocelyn on hers will each have their own
separate set of books. Backup and Restore move records between them. Step 3 is
what fixes that.

---

## 3. Supabase — one shared set of books

Today every record lives under a single key in one browser. That is why the
system works with no server and no monthly bill, and it is also why closing the
wrong tab is a bad afternoon.

### What moving gains

- One set of books, reachable from any machine.
- Kyla and Jocelyn looking at the same numbers at the same time.
- Real passwords, set and reset by the people who own them, instead of
  `code:'admin'` sitting in a file.
- Nothing lost when a browser is cleared or a laptop is replaced.
- Document numbers issued by the database, so two cashiers cannot both be
  handed `OR-2026-0042`.

### What it costs

A Supabase project, and a rewrite of `assets/db.js`. The schema is written and
waiting in `supabase/migrations/20260823000000_schema.sql`.

### Running the schema

In the new project: **SQL Editor → New query**, paste the whole of
`supabase/migrations/20260823000000_schema.sql`, run it once. Then **Settings → API** and
copy the project URL and the `anon` public key.

### What still has to be written

`assets/db.js` is the only file that touches storage — that was the point of
building it that way — but every other file calls `DB.get()` expecting an answer
immediately, and a database answers over the network. So the shape is:

- **Sign in** authenticates against Supabase Auth, then loads every table into
  memory in exactly the shape the app already uses.
- **`DB.get()`** keeps returning that object synchronously. Nothing in
  `app.js`, `accounting.js` or `applications.js` has to change.
- **`DB.save()`** stops writing to `localStorage` and writes the changed rows
  back, keeping the local copy as a cache so the screens stay instant.
- **A conflict check on save**, because two people editing the same booking is
  now possible where it never was before.

The alternative — making every call site asynchronous — means touching every
screen in the system, and would buy nothing the office would notice.

### Order to do it in

1. Create the project, run the schema.
2. Import the current records: **Backup** in the running system writes a JSON
   file, and that file is the migration source.
3. Rewrite `db.js` against the real project, with the tests extended to cover it.
4. Create the staff accounts in Supabase Auth and delete the plain-text codes.

Do not do step 4 before step 3 works, or nobody can sign in.
