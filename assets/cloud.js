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
  function keepSession(s){
    session = s && s.access_token ? s : null;
    try{
      if(session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    }catch(e){ /* a browser refusing to store is handled loudly elsewhere */ }
    return session;
  }
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

  async function refresh(){
    if(!session || !session.refresh_token) return null;
    try{
      const out = await auth('token?grant_type=refresh_token', { refresh_token:session.refresh_token });
      return keepSession(out);
    }catch(e){
      /* The refresh token is spent or revoked. Being signed out is the honest
         result; pretending otherwise just fails the next save instead. */
      keepSession(null);
      throw e;
    }
  }

  /* Supabase sends the mail and owns the link. Nobody here ever sees, sets or
     stores the new password, which is the entire point of moving off the build
     where an admin typed one into a form and it was written to disk in clear. */
  async function resetPassword(email){
    await auth('recover', { email });
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
     one that times out halfway through a day's work. */
  async function upsert(table, rows, batch = 500){
    if(!rows || !rows.length) return 0;
    for(let i = 0; i < rows.length; i += batch){
      await rest(table, {
        method:'POST',
        body:rows.slice(i, i + batch),
        headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
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

  /* Is this signed-in account actually one of the office's people? Being
     authenticated and being staff are different questions — RLS answers the
     second one, and a stranger who signs up gets rows back from nothing. */
  async function me(){
    const rows = await rest('staff?select=*&limit=1');
    return (rows && rows[0]) || null;
  }

  const reachable = async () => {
    try{ await fetch(`${URL_BASE}/rest/v1/`, { headers:{ apikey:ANON_KEY } }); return true; }
    catch(e){ return false; }
  };

  loadSession();

  return { URL_BASE, SCHEMA, signIn, signOut, refresh, resetPassword, signedIn, currentUser,
           loadSession, keepSession, selectAll, upsert, remove, rpc, rest, me, reachable };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = CLOUD;
