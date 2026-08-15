/* ui.js — rendering helpers. No framework, no CDN: everything here works from file://. */

const UI = (() => {

  /* ---------- formatting ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const peso = n => '₱' + Number(n||0).toLocaleString('en-PH',{ minimumFractionDigits:2, maximumFractionDigits:2 });
  const num  = n => Number(n||0).toLocaleString('en-PH',{ minimumFractionDigits:2, maximumFractionDigits:2 });
  const int  = n => Number(n||0).toLocaleString('en-PH');

  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function date(d){
    if(!d) return '—';
    const x = new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
    if(isNaN(x)) return d;
    return `${MON[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
  }
  const dateShort = d => { if(!d) return '—'; const x = new Date(d+'T00:00:00'); return `${MON[x.getMonth()]} ${x.getDate()}`; };
  const dateRange = (a,b) => {
    const x = new Date(a+'T00:00:00'), y = new Date(b+'T00:00:00');
    return x.getMonth() === y.getMonth()
      ? `${MON[x.getMonth()]} ${x.getDate()}–${y.getDate()}, ${y.getFullYear()}`
      : `${dateShort(a)} – ${date(b)}`;
  };
  const days = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  const tag = (text, kind) => `<span class="tag t-${kind}">${esc(text)}</span>`;

  const STATUS_KIND = {
    Paid:'ok', Unpaid:'bad', Partial:'warn', Void:'muted', Overdue:'bad',
    Enrolled:'ok', Reserved:'warn', Completed:'info', Cancelled:'muted', Dropped:'muted',
    Open:'sea', Ongoing:'ok', Closed:'muted', Passed:'ok', Failed:'bad',
    // Admissions lifecycle — see applications.js
    Submitted:'sea', 'Under Review':'warn', Approved:'info', Rejected:'bad', Withdrawn:'muted',
  };
  const statusTag = s => tag(s || '—', STATUS_KIND[s] || 'muted');

  /* ---------- tables ---------- */
  /* cols: [{ h:'Header', k:'key'|fn, cls:'num', w:'90px' }] */
  function table(cols, rows, opts = {}){
    if(!rows.length){
      return `<div class="empty"><span class="big">⚓</span>${esc(opts.empty || 'Nothing to show yet.')}</div>`;
    }
    const head = cols.map(c => `<th class="${c.cls||''}" ${c.w?`style="width:${c.w}"`:''}>${esc(c.h)}</th>`).join('');
    const body = rows.map((r,i) => {
      const attrs = opts.rowAttrs ? opts.rowAttrs(r,i) : '';
      const tds = cols.map(c => {
        const v = typeof c.k === 'function' ? c.k(r,i) : esc(r[c.k]);
        return `<td class="${c.cls||''}">${v ?? ''}</td>`;
      }).join('');
      return `<tr class="${opts.rowClass || ''}" ${attrs}>${tds}</tr>`;
    }).join('');
    const foot = opts.foot
      ? `<tfoot><tr>${cols.map((c,i) => `<td class="${c.cls||''}">${opts.foot[i] ?? ''}</td>`).join('')}</tr></tfoot>`
      : '';
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  }

  const card = (title, body, opts = {}) => `
    <div class="card ${opts.cls||''}">
      ${title ? `<div class="card-head"><div><h3>${esc(title)}</h3>${opts.sub?`<p>${esc(opts.sub)}</p>`:''}</div>
        <div class="chips">${opts.actions||''}</div></div>` : ''}
      <div class="card-body ${opts.flush?'flush':''}">${body}</div>
    </div>`;

  const kpi = (label, value, sub, kind) => `
    <div class="kpi ${kind?'k-'+kind:''}">
      <div class="lbl">${esc(label)}</div>
      <div class="val">${value}</div>
      <div class="sub">${sub||''}</div>
    </div>`;

  /* ---------- form fields ---------- */
  const f = {
    text:  (n,l,v='',o={}) => `<label class="fld"><span>${esc(l)} ${o.hint?`<small>${esc(o.hint)}</small>`:''}</span>
              <input name="${n}" value="${esc(v)}" ${o.req?'required':''} ${o.ro?'readonly':''} placeholder="${esc(o.ph||'')}" ${o.attr||''}></label>`,
    num:   (n,l,v='',o={}) => `<label class="fld"><span>${esc(l)}</span>
              <input type="number" step="${o.step||'0.01'}" min="${o.min ?? ''}" name="${n}" value="${esc(v)}" ${o.req?'required':''} ${o.ro?'readonly':''}></label>`,
    date:  (n,l,v='',o={}) => `<label class="fld"><span>${esc(l)}</span><input type="date" name="${n}" value="${esc(v)}" ${o.req?'required':''}></label>`,
    area:  (n,l,v='',o={}) => `<label class="fld"><span>${esc(l)}</span><textarea name="${n}" placeholder="${esc(o.ph||'')}">${esc(v)}</textarea></label>`,
    select:(n,l,v,opts,o={}) => `<label class="fld"><span>${esc(l)}</span><select name="${n}" ${o.req?'required':''} ${o.attr||''}>
              ${o.blank ? `<option value="">${esc(o.blank)}</option>` : ''}
              ${opts.map(op => {
                 const val = op.v ?? op, lab = op.l ?? op;
                 return `<option value="${esc(val)}" ${String(val)===String(v)?'selected':''}>${esc(lab)}</option>`;
               }).join('')}</select></label>`,
  };
  const row = (...cells) => `<div class="grid g${cells.length>3?3:cells.length}">${cells.join('')}</div>`;

  /* ---------- modal ---------- */
  let onSubmitFn = null;
  function modal({ title, sub, body, submitLabel, onSubmit, wide, footExtra, hideSubmit }){
    close();
    onSubmitFn = onSubmit;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-backdrop" id="mBackdrop">
        <div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}</div>
            <button class="x-close" id="mX" aria-label="Close">&times;</button>
          </div>
          <form id="mForm"><div class="modal-body">${body}</div>
            <div class="modal-foot">
              ${footExtra||''}
              <button type="button" class="btn btn-ghost" id="mCancel">Close</button>
              ${hideSubmit?'':`<button type="submit" class="btn btn-primary">${esc(submitLabel||'Save')}</button>`}
            </div>
          </form>
        </div>
      </div>`;
    document.getElementById('mX').onclick = close;
    document.getElementById('mCancel').onclick = close;
    document.getElementById('mBackdrop').onmousedown = e => { if(e.target.id === 'mBackdrop') close(); };
    document.getElementById('mForm').onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      if(onSubmitFn && onSubmitFn(fd, e.target) !== false) close();
    };
    const first = document.querySelector('#mForm input:not([readonly]),#mForm select');
    if(first) setTimeout(() => first.focus(), 40);
  }
  function close(){ document.getElementById('modalRoot').innerHTML = ''; onSubmitFn = null; }
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });

  function confirm(msg, onYes, opts = {}){
    modal({
      title: opts.title || 'Please confirm',
      body: `<p style="margin:0 0 4px">${esc(msg)}</p>${opts.detail?`<p class="muted" style="font-size:12.5px">${esc(opts.detail)}</p>`:''}
             ${opts.reason ? f.text('reason','Reason','',{ph:'Recorded in the audit trail'}) : ''}`,
      submitLabel: opts.yes || 'Yes, proceed',
      onSubmit: fd => { onYes(fd); }
    });
    const b = document.querySelector('#mForm button[type=submit]');
    if(b && opts.danger){ b.classList.remove('btn-primary'); b.classList.add('btn-danger'); }
  }

  /* ---------- toast ---------- */
  function toast(msg, kind = 'ok'){
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    document.getElementById('toastRoot').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  /* ---------- charts (inline SVG) ---------- */
  function barChart(items, opts = {}){
    if(!items.length) return `<div class="empty">No data for this period.</div>`;
    const max = Math.max(...items.map(i => i.value), 1);
    return items.map(i => `
      <div class="bar-row">
        <div class="nowrap" title="${esc(i.label)}" style="overflow:hidden;text-overflow:ellipsis">${esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.value/max*100).toFixed(1)}%"></div></div>
        <div class="num">${opts.money ? peso(i.value) : int(i.value)}</div>
      </div>`).join('');
  }

  /* Dual-series column chart: collections vs billings by month. */
  function columns(series, opts = {}){
    const W = 640, H = 210, pad = { l:52, r:10, t:12, b:26 };
    const n = series.length || 1;
    const max = Math.max(...series.flatMap(s => [s.a, s.b]), 1);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const bw = Math.min(26, (iw / n) / 2.6);
    const y = v => pad.t + ih - (v / max) * ih;

    const grid = [0, .25, .5, .75, 1].map(p => {
      const gy = pad.t + ih - p * ih;
      return `<line x1="${pad.l}" y1="${gy}" x2="${W-pad.r}" y2="${gy}" stroke="#e3e9f2"/>
              <text x="${pad.l-7}" y="${gy+4}" text-anchor="end" font-size="9.5" fill="#7a8aa3">${shortMoney(max*p)}</text>`;
    }).join('');

    const bars = series.map((s,i) => {
      const cx = pad.l + (iw / n) * (i + .5);
      return `
        <rect x="${cx-bw-2}" y="${y(s.a)}" width="${bw}" height="${Math.max(pad.t+ih-y(s.a),0)}" rx="2" fill="#1d4571"><title>${esc(s.label)} billed: ${peso(s.a)}</title></rect>
        <rect x="${cx+2}"    y="${y(s.b)}" width="${bw}" height="${Math.max(pad.t+ih-y(s.b),0)}" rx="2" fill="#0f7b8a"><title>${esc(s.label)} collected: ${peso(s.b)}</title></rect>
        <text x="${cx}" y="${H-8}" text-anchor="middle" font-size="10" fill="#4a5c76">${esc(s.label)}</text>`;
    }).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${esc(opts.title||'chart')}">
        ${grid}${bars}
      </svg>
      <div class="chips" style="justify-content:center;margin-top:6px;font-size:12px;color:var(--text-2)">
        <span><span style="display:inline-block;width:9px;height:9px;background:#1d4571;border-radius:2px"></span> Billed</span>
        <span style="margin-left:14px"><span style="display:inline-block;width:9px;height:9px;background:#0f7b8a;border-radius:2px"></span> Collected</span>
      </div>`;
  }

  function donut(parts, opts = {}){
    const total = parts.reduce((s,p) => s + p.value, 0);
    if(!total) return `<div class="empty">No data yet.</div>`;
    const R = 60, C = 2 * Math.PI * R;
    let off = 0;
    const rings = parts.map(p => {
      const len = (p.value / total) * C;
      const el = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${p.color}" stroke-width="22"
        stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(p.label)}: ${int(p.value)}</title></circle>`;
      off += len; return el;
    }).join('');
    const legend = parts.map(p => `<div style="display:flex;gap:7px;align-items:center;font-size:12.5px;margin-bottom:5px">
        <span style="width:10px;height:10px;border-radius:2px;background:${p.color};flex:none"></span>
        <span style="flex:1">${esc(p.label)}</span><b class="mono">${opts.money?peso(p.value):int(p.value)}</b></div>`).join('');
    return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <svg viewBox="0 0 160 160" style="width:150px;flex:none">${rings}
          <text x="80" y="76" text-anchor="middle" font-size="22" font-weight="700" fill="#12233b">${opts.money?'':int(total)}</text>
          <text x="80" y="94" text-anchor="middle" font-size="10" fill="#7a8aa3">${esc(opts.center||'TOTAL')}</text>
        </svg>
        <div style="flex:1;min-width:160px">${legend}</div>
      </div>`;
  }

  function shortMoney(n){
    n = Number(n)||0;
    if(n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if(n >= 1e3) return Math.round(n/1e3) + 'k';
    return String(Math.round(n));
  }

  const print = () => window.print();

  return { esc, peso, num, int, date, dateShort, dateRange, days, tag, statusTag, table, card, kpi,
           f, row, modal, close, confirm, toast, barChart, columns, donut, shortMoney, print };
})();
