/* cloud.js — the office's records, kept somewhere other than one browser.

   Everything this system knew used to live in one localStorage key on one
   machine. That is why a day of encoding could vanish and nobody could see
   anybody else's work. This file is the other end of that: Supabase Auth for
   signing in, and PostgREST for the rows.

   There is no SDK here on purpose. The rest of the site is a static page with
   no build step and no dependencies, and the whole of what we need — sign in,
   refresh, read a table, upsert some rows, delete some rows — is six fetch
   calls. Pulling in a bundler and 100KB of client to avoid writing them would
   cost more than it saved.

   About the key below: it is meant to be public. An anon/publishable key
   identifies the project, it does not grant anything — every table in `tbm` has
   row level security on it and every policy demands an authenticated member of
   tbm.staff. Someone reading this file learns the project's address and nothing
   else. The service_role key, which would grant everything, is not here and
   must never be: it belongs in the Supabase dashboard and nowhere a browser can
   reach it. */
const CLOUD = (() => {
  'use strict';

  const URL_BASE = 'https://bskbsslibwhrmvzdihlq.supabase.co';
  const ANON_KEY = 'sb_publishable_c0X5vTa_1taOrwIlDal4jQ_leSdDIDq';
  /* Every table lives in `tbm`, not `public`. PostgREST will not look outside
     the default schema unless it is told to, per request, on both sides. */
  const SCHEMA = 'tbm';
  const SESSION_KEY = 'tbm_session';

  let session = null;   // { access_token, refresh_token, expires_at, user }

  /* ---------- the session ---------- */
  function loadSession(){
    try{ session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch(e){ session = null; }
    return session;
  }
  /* If the browser will not keep this, the next reload is a sign-out and there
     is nothing else to conclude from. The old comment claimed it was handled
     loudly somewhere else; it was not, and somebody in private browsing was
     being asked for their password every time they pressed refresh with no
     explanation offered. */
  let storageRefused = false;
  function keepSession(s){
    session = s && s.access_token ? s : null;
    try{
      if(session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
      storageRefused = false;
    }catch(e){ storageRefused = true; }
    return session;
  }
  const sessionRemembered = () => !storageRefused;
  const signedIn = () => !!(session && session.access_token);
  const currentUser = () => (session && session.user) || null;

  /* An access token is good for an hour. Refresh a minute early rather than
     letting a save be the thing that discovers it expired. */
  const stale = () => !session || !session.expires_at
    || (session.expires_at * 1000) - Date.now() < 60000;

  async function auth(path, body){
    const r = await fetch(`${URL_BASE}/auth/v1/${path}`, {
      method:'POST',
      headers:{ 'apikey':ANON_KEY, 'Content-Type':'application/json' },
      body:JSON.stringify(body),
    });
    const out = await r.json().catch(() => ({}));
    if(!r.ok){
      const e = new Error(out.error_description || out.msg || out.message || `Sign-in failed (${r.status}).`);
      e.status = r.status;
      throw e;
    }
    return out;
  }

  async function signIn(email, password){
    const out = await auth('token?grant_type=password', { email, password });
    return keepSession(out);
  }

  /* One refresh at a time, shared by everybody who asks for it.

     This is why the office was being signed out in the middle of editing.
     Refresh token rotation is on, so each refresh mints a new token and spends
     the old one — and a sync sends a dozen requests at once. They all saw the
     access token was about to expire, all called refresh together, one won, and
     the rest presented a token that had just been spent. The server said no,
     quite correctly, and the session was thrown away mid-sentence.

     Everyone now waits on the same promise, so the token is only ever spent
     once. */
  let refreshing = null;
  async function refresh(){
    if(!session || !session.refresh_token) return null;
    if(refreshing) return refreshing;
    refreshing = (async () => {
      try{
        return keepSession(await auth('token?grant_type=refresh_token',
                                      { refresh_token:session.refresh_token }));
      }catch(e){
        /* A definite refusal ends the session: the token really is spent or
           revoked, and pretending otherwise just fails the next save instead.
           A network failure is not a refusal — the connection dropped, the
           token is still good, and signing somebody out for a dead wifi minute
           loses whatever they had not pushed yet. */
        if(e.status === 400 || e.status === 401) keepSession(null);
        throw e;
      }finally{ refreshing = null; }
    })();
    return refreshing;
  }

  /* Supabase sends the mail and owns the link. Nobody here ever sees, sets or
     stores the new password, which is the entire point of moving off the build
     where an admin typed one into a form and it was written to disk in clear. */
  async function resetPassword(email){
    await auth('recover', { email });
    return true;
  }

  /* Your own password, changed by you. Supabase takes the new one directly; it
     never passes through this office's records, and nobody else — admin
     included — can read it afterwards. */
  async function updatePassword(password){
    if(!signedIn()) throw new Error('Sign in first.');
    if(stale()) await refresh();
    const r = await fetch(`${URL_BASE}/auth/v1/user`, {
      method:'PUT',
      headers:{ 'apikey':ANON_KEY, 'Content-Type':'application/json',
                'Authorization':`Bearer ${session.access_token}` },
      body:JSON.stringify({ password }),
    });
    const out = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(out.msg || out.error_description || out.message || 'The change was refused.');
    return true;
  }

  async function signOut(){
    if(session){
      try{
        await fetch(`${URL_BASE}/auth/v1/logout`, {
          method:'POST',
          headers:{ 'apikey':ANON_KEY, 'Authorization':`Bearer ${session.access_token}` },
        });
      }catch(e){ /* going offline should still sign you out of this browser */ }
    }
    keepSession(null);
  }

  /* ---------- the rows ---------- */
  async function headers(write){
    if(signedIn() && stale()) await refresh();
    const h = {
      'apikey':ANON_KEY,
      'Content-Type':'application/json',
      [write ? 'Content-Profile' : 'Accept-Profile']:SCHEMA,
    };
    if(signedIn()) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  }

  async function rest(path, opts = {}){
    const write = !!opts.method && opts.method !== 'GET';
    const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      method:opts.method || 'GET',
      headers:{ ...(await headers(write)), ...(opts.headers || {}) },
      body:opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if(!r.ok){
      const text = await r.text().catch(() => '');
      let detail = text;
      try{ const j = JSON.parse(text); detail = j.message || j.hint || j.details || text; }catch(e){}
      const e = new Error(detail || `Request failed (${r.status}).`);
      e.status = r.status;
      e.path = path;
      throw e;
    }
    if(r.status === 204) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  /* PostgREST caps a response at its configured page size, so a table is read
     in windows rather than assumed to arrive whole. A catalogue of 341 courses
     fits today; the trainee register will not, a year from now. */
  async function selectAll(table, pageSize = 1000){
    const out = [];
    for(let from = 0; ; from += pageSize){
      const page = await rest(`${table}?select=*`, {
        headers:{ 'Range-Unit':'items', 'Range':`${from}-${from + pageSize - 1}` },
      });
      if(!page || !page.length) break;
      out.push(...page);
      if(page.length < pageSize) break;
    }
    return out;
  }

  /* Upsert in batches: one enormous body is the request most likely to be the
     one that times out halfway through a day's work.

     merge:false makes it a plain insert. An append-only table has no id to
     merge on, and asking PostgREST to resolve duplicates against a key that is
     not there fails the whole batch. */
  async function upsert(table, rows, batch = 500, merge = true){
    if(!rows || !rows.length) return 0;
    for(let i = 0; i < rows.length; i += batch){
      await rest(table, {
        method:'POST',
        body:rows.slice(i, i + batch),
        headers:{ 'Prefer':(merge ? 'resolution=merge-duplicates,' : '') + 'return=minimal' },
      });
    }
    return rows.length;
  }

  async function remove(table, ids, key = 'id'){
    if(!ids || !ids.length) return 0;
    const quoted = ids.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    await rest(`${table}?${key}=in.(${quoted})`, {
      method:'DELETE', headers:{ 'Prefer':'return=minimal' },
    });
    return ids.length;
  }

  async function rpc(fn, args){
    return rest(`rpc/${fn}`, { method:'POST', body:args || {} });
  }

  /* Who Supabase says this session belongs to. The sign-in response carries it,
     but a session restored from a reset link does not, so it can be asked for. */
  async function whoami(){
    if(session && session.user && session.user.id) return session.user;
    if(!signedIn()) return null;
    if(stale()) await refresh();
    const r = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers:{ 'apikey':ANON_KEY, 'Authorization':`Bearer ${session.access_token}` },
    });
    if(!r.ok) return null;
    const user = await r.json().catch(() => null);
    if(user && user.id) keepSession({ ...session, user });
    return user;
  }

  /* Is this signed-in account actually one of the office's people? Being
     authenticated and being staff are different questions — RLS answers the
     second one, and a stranger who signs up gets rows back from nothing.

     The row has to be asked for by id. Staff may read each other — the office
     is four people who share a room — so "select from staff limit 1" returns
     whoever happens to sort first, not whoever just signed in. It did exactly
     that: the admin signed in and was handed the front desk's name, and the
     front desk's permissions with it. Authentication was never the problem;
     the query was. */
  async function me(){
    const user = await whoami();
    if(!user || !user.id) return null;
    const rows = await rest(`staff?select=*&id=eq.${encodeURIComponent(user.id)}`);
    return (rows && rows[0]) || null;
  }

  const reachable = async () => {
    try{ await fetch(`${URL_BASE}/rest/v1/`, { headers:{ apikey:ANON_KEY } }); return true; }
    catch(e){ return false; }
  };

  loadSession();

  return { URL_BASE, SCHEMA, signIn, signOut, refresh, resetPassword, updatePassword, signedIn, currentUser,
           loadSession, keepSession, sessionRemembered, selectAll, upsert, remove, rpc, rest, me, whoami, reachable };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = CLOUD;
