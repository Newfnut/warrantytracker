import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, onSnapshot, updateDoc, deleteDoc, query as fsQ, orderBy, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ═══════════════════════════════════════════
// CONFIG & FIREBASE INIT
// ═══════════════════════════════════════════
const fbConfig = {
  apiKey: "AIzaSyATdyW05921fNz_wyZ3zjYVF4o44mm_tyg",
  authDomain: "hallarc.firebaseapp.com",
  projectId: "hallarc",
  storageBucket: "hallarc.firebasestorage.app",
  messagingSenderId: "1057782930451",
  appId: "1:1057782930491:web:b54109ac07001be634501e"
};
const fbApp = initializeApp(fbConfig, 'warrantytracker');
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ═══════════════════════════════════════════
// DEV MODE
// ═══════════════════════════════════════════
const DEV = new URLSearchParams(location.search).has('dev');

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const S = {
  screen: 'loading',
  tab: 'dashboard',        // 'dashboard' | 'all' | 'vault'
  user: null,
  householdId: null,
  items: [],               // warrantyItems
  cards: [],               // creditCards
  unsubs: [],
  theme: localStorage.getItem('wv-theme') || 'light',
  authMode: 'signin',      // 'signin' | 'signup' | 'join'
  pendingHouseholdCode: null,
  // editor state
  editorItem: null,
  editorMode: 'add',       // 'add' | 'edit'
  editorCardId: '',
  editorMfgYears: 1,
  editorStatus: 'active',
  // card editor
  cardEditorItem: null,
  cardEditorMode: 'add',
  cardEditorNetwork: 'Visa',
  cardEditorExtraYears: 1,
  // detail
  detailItem: null,
  // filter
  filterStatus: 'all',
};

// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
function setTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('meta-theme')?.setAttribute('content', t === 'dark' ? '#1c1c1e' : '#2563eb');
  localStorage.setItem('wv-theme', t);
}
setTheme(S.theme);

// ═══════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════
function go(screen) { S.screen = screen; render(); }
function goTab(tab) { S.tab = tab; render(); }

// ═══════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════
function render() {
  const app = document.getElementById('app');
  switch (S.screen) {
    case 'loading': app.innerHTML = `<div class="loading-screen"><div style="font-size:44px">🛡️</div><div class="spin"></div></div>`; return;
    case 'auth':    app.innerHTML = renderAuth();      break;
    case 'main':    app.innerHTML = renderMain();      break;
  }
  bind();
}

// ─── Auth ────────────────────────────────────
function renderAuth() {
  const m = S.authMode;
  return `
  <div class="screen" id="auth-screen">
    <div class="auth-logo">🛡️</div>
    <div class="auth-title">WarrantyVault</div>
    <div class="auth-sub">Never miss a warranty claim again</div>
    <div class="auth-form">
      ${m === 'join' ? `
        <input class="auth-inp" id="a-code" type="text" placeholder="6-digit household code" maxlength="6" autocomplete="off" style="text-align:center;font-size:22px;letter-spacing:.18em">
      ` : `
        <input class="auth-inp" id="a-email" type="email" placeholder="Email address" autocomplete="email">
        <input class="auth-inp" id="a-pass" type="password" placeholder="Password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">
        ${m === 'signup' ? `<input class="auth-inp" id="a-name" type="text" placeholder="Your name">` : ''}
      `}
      <div id="a-err" style="display:none" class="err-msg"></div>
      <button class="btn-main" style="margin:0;width:100%" id="a-submit">
        ${m === 'signin' ? 'Sign In' : m === 'signup' ? 'Create Account' : 'Join Household'}
      </button>
    </div>
    ${m !== 'join' ? `
      <div class="auth-link">${m === 'signin' ? `No account? <a href="#" id="a-toggle">Sign up</a>` : `Have an account? <a href="#" id="a-toggle">Sign in</a>`}</div>
      <div class="auth-or">or</div>
      <button class="btn-outline" id="a-join-btn">Join existing household</button>
    ` : `<div class="auth-link"><a href="#" id="a-toggle">Back to sign in</a></div>`}
  </div>`;
}

// ─── Main (tabbed) ────────────────────────────
function renderMain() {
  let tabContent = '';
  if (S.tab === 'dashboard') tabContent = renderDashboard();
  else if (S.tab === 'all')  tabContent = renderAll();
  else if (S.tab === 'vault') tabContent = renderVault();

  return `
  <div class="screen" id="main-screen">
    ${tabContent}
    ${renderTabBar()}
  </div>
  ${renderItemSheet()}
  ${renderDetailSheet()}
  ${renderCardSheet()}
  ${renderCardPickerSheet()}
  ${renderAccountSheet()}`;
}

function renderTabBar() {
  const tabs = [
    { id: 'dashboard', ico: '🛡️', lbl: 'Dashboard' },
    { id: 'all',       ico: '📋', lbl: 'All Items' },
    { id: 'vault',     ico: '💳', lbl: 'Card Vault' },
  ];
  return `<div class="tab-bar">${tabs.map(t => `
    <div class="tab-btn${S.tab === t.id ? ' active' : ''}" data-tab="${t.id}">
      <span class="tab-ico">${t.ico}</span>
      <span class="tab-lbl">${t.lbl}</span>
    </div>`).join('')}</div>`;
}

// ─── Dashboard ────────────────────────────────
function renderDashboard() {
  const now = new Date();
  const active  = S.items.filter(i => i.status === 'active');
  const expiring = active.filter(i => daysUntil(bestExpiry(i)) <= 90 && daysUntil(bestExpiry(i)) >= 0);
  const expired  = S.items.filter(i => i.status !== 'claimed' && daysUntil(bestExpiry(i)) < 0 && i.status !== 'expired');
  const claimed  = S.items.filter(i => i.status === 'claimed');

  return `
  <div class="hdr">
    <div style="flex:1">
      <div class="hdr-title">WarrantyVault 🛡️</div>
    </div>
    <button class="ico-btn" id="h-theme" title="Toggle theme">${S.theme === 'dark' ? '☀️' : '🌙'}</button>
    <button class="ico-btn" id="h-account" title="Account">👤</button>
    <button class="ico-btn" id="h-add" title="Add item" style="background:var(--accent);color:var(--accent-fg);font-size:22px;font-weight:300">＋</button>
  </div>
  <div class="scroll">
    <div class="summary-bar">
      <div class="summary-col">
        <div class="summary-val">${active.length}</div>
        <div class="summary-lbl">Active</div>
      </div>
      <div class="summary-col">
        <div class="summary-val${expiring.length > 0 ? ' warn' : ' muted'}">${expiring.length}</div>
        <div class="summary-lbl">Expiring</div>
      </div>
      <div class="summary-col">
        <div class="summary-val${claimed.length > 0 ? '' : ' muted'}">${claimed.length}</div>
        <div class="summary-lbl">Claimed</div>
      </div>
    </div>

    ${expiring.length ? `
      <div class="sec-hdr">⚠️ Expiring Soon</div>
      ${expiring.sort((a,b) => daysUntil(bestExpiry(a)) - daysUntil(bestExpiry(b))).map(i => itemCardHTML(i)).join('')}
    ` : ''}

    ${active.filter(i => daysUntil(bestExpiry(i)) > 90).length ? `
      <div class="sec-hdr">Active Warranties</div>
      ${active.filter(i => daysUntil(bestExpiry(i)) > 90).sort((a,b) => (a.name||'').localeCompare(b.name||'')).map(i => itemCardHTML(i)).join('')}
    ` : ''}

    ${!S.items.length ? `
      <div class="empty">
        <span class="empty-ico">🛡️</span>
        <div class="empty-ttl">No warranties yet</div>
        <div class="empty-txt">Tap ＋ to add your first item — receipt photo, purchase date, and which card you used.</div>
      </div>
    ` : ''}

    <div style="height:8px"></div>
  </div>`;
}

// ─── All Items ────────────────────────────────
function renderAll() {
  const filters = ['all','active','expiring','expired','claimed'];
  let filtered = [...S.items];
  if (S.filterStatus === 'active')   filtered = filtered.filter(i => i.status === 'active' && daysUntil(bestExpiry(i)) > 90);
  if (S.filterStatus === 'expiring') filtered = filtered.filter(i => i.status === 'active' && daysUntil(bestExpiry(i)) <= 90 && daysUntil(bestExpiry(i)) >= 0);
  if (S.filterStatus === 'expired')  filtered = filtered.filter(i => i.status !== 'claimed' && daysUntil(bestExpiry(i)) < 0);
  if (S.filterStatus === 'claimed')  filtered = filtered.filter(i => i.status === 'claimed');
  filtered.sort((a,b) => (a.name||'').localeCompare(b.name||''));

  return `
  <div class="hdr">
    <div class="hdr-title">All Items</div>
    <button class="ico-btn" id="h-add-all" title="Add item" style="background:var(--accent);color:var(--accent-fg);font-size:22px;font-weight:300">＋</button>
  </div>
  <div style="display:flex;gap:6px;padding:10px 12px 0;overflow-x:auto;flex-shrink:0">
    ${filters.map(f => `<button class="filter-pill${S.filterStatus===f?' active':''}" data-f="${f}">${cap(f)}</button>`).join('')}
  </div>
  <div class="scroll" style="padding-top:8px">
    ${filtered.length ? filtered.map(i => itemCardHTML(i)).join('') : `
      <div class="empty">
        <span class="empty-ico">📋</span>
        <div class="empty-ttl">No items here</div>
        <div class="empty-txt">Nothing matches this filter.</div>
      </div>`}
    <div style="height:8px"></div>
  </div>`;
}

// ─── Vault ────────────────────────────────────
function renderVault() {
  return `
  <div class="hdr">
    <div class="hdr-title">Card Vault 💳</div>
    <button class="ico-btn" id="h-add-card" title="Add card" style="background:var(--accent);color:var(--accent-fg);font-size:22px;font-weight:300">＋</button>
  </div>
  <div class="scroll">
    <div class="sec-hdr" style="padding-top:14px">Your Credit Cards</div>
    <div style="font-size:13px;color:var(--text-secondary);padding:0 16px 12px;line-height:1.5">
      Add cards with their extended warranty terms. When you log a purchase, pick the card you used and the extra coverage is calculated automatically.
    </div>
    ${S.cards.length ? S.cards.map(c => `
      <div class="cc-card" data-cid="${c.id}">
        <div class="cc-icon" style="background:${networkColor(c.network).bg};color:${networkColor(c.network).text}">${networkIcon(c.network)}</div>
        <div class="cc-info">
          <div class="cc-name">${esc(c.nickname)}</div>
          <div class="cc-detail">${c.network}${c.maxClaimAmount ? ` · Max $${c.maxClaimAmount.toLocaleString()}` : ''}${c.notes ? ' · ' + c.notes : ''}</div>
        </div>
        <div class="cc-extra">+${c.extraWarrantyYears}yr</div>
      </div>`).join('') : `
      <div class="empty">
        <span class="empty-ico">💳</span>
        <div class="empty-ttl">No cards yet</div>
        <div class="empty-txt">Add your credit cards and their warranty extension benefits so you never miss extra coverage.</div>
      </div>`}
    <div style="height:8px"></div>
  </div>`;
}

// ─── Item card HTML ───────────────────────────
function itemCardHTML(item) {
  const mfgD = daysUntil(item.mfgExpiry);
  const ccD  = item.ccExpiry ? daysUntil(item.ccExpiry) : null;
  const best = bestExpiry(item);
  const bestD = daysUntil(best);

  const statusBadge = () => {
    if (item.status === 'claimed') return `<span class="badge badge-claimed">✓ Claimed</span>`;
    if (bestD < 0)   return `<span class="badge badge-expired">Expired</span>`;
    if (bestD <= 30) return `<span class="badge badge-expiring">⚠ ${bestD}d left</span>`;
    if (bestD <= 90) return `<span class="badge badge-expiring">${bestD}d left</span>`;
    return `<span class="badge badge-active">Active</span>`;
  };

  const expiryClass = (d) => d === null ? 'none' : d < 0 ? 'past' : d <= 90 ? 'soon' : 'ok';
  const expiryStr = (d, dateStr) => {
    if (!dateStr) return '—';
    if (d < 0) return `Expired ${fmtShort(dateStr)}`;
    if (d === 0) return 'Expires today';
    if (d <= 90) return `${fmtDate(dateStr)} (${d}d)`;
    return fmtDate(dateStr);
  };

  return `
  <div class="witem" data-wid="${item.id}">
    <div class="witem-inner">
      <div class="witem-top">
        <div class="witem-icon">${itemIcon(item.name)}</div>
        <div class="witem-info">
          <div class="witem-name">${esc(item.name)}</div>
          <div class="witem-store">${esc(item.store || '')}${item.purchaseDate ? ' · ' + fmtDate(item.purchaseDate) : ''}</div>
        </div>
        ${item.price ? `<div class="witem-price">$${item.price.toFixed(2)}</div>` : ''}
      </div>
      <div class="witem-badges">
        ${statusBadge()}
        ${item.cardNickname ? `<span class="badge badge-cc">💳 ${esc(item.cardNickname)}</span>` : ''}
      </div>
      <div class="witem-expiry-row">
        <div class="witem-expiry-col">
          <div class="witem-expiry-lbl">Mfg Warranty</div>
          <div class="witem-expiry-val ${expiryClass(mfgD)}">${expiryStr(mfgD, item.mfgExpiry)}</div>
        </div>
        ${item.ccExpiry ? `
        <div class="witem-expiry-col">
          <div class="witem-expiry-lbl">CC Extended</div>
          <div class="witem-expiry-val ${expiryClass(ccD)}">${expiryStr(ccD, item.ccExpiry)}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ─── Item editor sheet ────────────────────────
function renderItemSheet() {
  const item = S.editorItem || {};
  const cards = S.cards;
  const selectedCard = cards.find(c => c.id === S.editorCardId);
  const mfgYears = S.editorMfgYears;

  // Calculate expiry preview
  const pd = item.purchaseDate || todayStr();
  const mfgExp = addYears(pd, mfgYears);
  const ccExp  = selectedCard ? addYears(pd, mfgYears + (selectedCard.extraWarrantyYears || 0)) : null;

  return `
  <div class="overlay" id="item-sheet">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-hdr-row">
        <div style="flex:1;font-size:17px;font-weight:600">${S.editorMode === 'add' ? 'Add Item' : 'Edit Item'}</div>
        ${S.editorMode === 'edit' ? `<button class="ico-btn" id="ei-del" style="color:var(--danger)">🗑</button>` : ''}
        <button class="ico-btn" id="ei-save" style="color:var(--accent);font-weight:700;font-size:15px;width:auto;padding:0 4px">Save</button>
      </div>

      <div class="fg"><label class="fg-label">Item name</label>
        <input class="finput" id="ei-name" type="text" value="${esc(item.name || '')}" placeholder="e.g. LG 65&quot; TV" autocorrect="off" autocapitalize="words"></div>

      <div class="fg"><label class="fg-label">Store purchased</label>
        <input class="finput" id="ei-store" type="text" value="${esc(item.store || '')}" placeholder="e.g. Costco" autocorrect="off" autocapitalize="words"></div>

      <div class="frow">
        <div class="fg"><label class="fg-label">Purchase date</label>
          <input class="finput" id="ei-date" type="date" value="${item.purchaseDate || todayStr()}"></div>
        <div class="fg"><label class="fg-label">Price paid</label>
          <input class="finput" id="ei-price" type="number" value="${item.price || ''}" min="0" step="0.01" placeholder="0.00"></div>
      </div>

      <div class="fg"><label class="fg-label">Manufacturer warranty</label>
        <div class="year-stepper" id="mfg-stepper">
          <button class="year-btn" id="mfg-minus">−</button>
          <div class="year-val" id="mfg-val">${mfgYears} year${mfgYears !== 1 ? 's' : ''}</div>
          <button class="year-btn" id="mfg-plus">＋</button>
        </div>
      </div>

      <div class="fg"><label class="fg-label">Credit card used</label>
        <div class="card-picker-row" id="ei-card-picker">
          <span class="card-picker-lbl" id="ei-card-lbl">${selectedCard ? '💳 ' + esc(selectedCard.nickname) : 'No card selected'}</span>
          <span class="card-picker-chev">›</span>
        </div>
      </div>

      ${(mfgExp || ccExp) ? `
      <div class="fg">
        <div class="calc-hint">
          📅 <strong>Mfg expires:</strong> ${fmtDate(mfgExp)}<br>
          ${ccExp ? `💳 <strong>CC extended to:</strong> ${fmtDate(ccExp)}` : ''}
        </div>
      </div>` : ''}

      <div class="fg"><label class="fg-label">Serial number</label>
        <input class="finput" id="ei-serial" type="text" value="${esc(item.serialNumber || '')}" placeholder="Optional" autocorrect="off" autocapitalize="characters"></div>

      <div class="fg"><label class="fg-label">Notes</label>
        <textarea class="finput" id="ei-notes" placeholder="Any details…">${esc(item.notes || '')}</textarea></div>

      ${S.editorMode === 'edit' ? `
      <div class="fg"><label class="fg-label">Status</label></div>
      <div class="status-grid" id="status-grid">
        <div class="status-opt${S.editorStatus === 'active' ? ' sel' : ''}" data-s="active">Active</div>
        <div class="status-opt${S.editorStatus === 'expired' ? ' sel' : ''}" data-s="expired">Expired</div>
        <div class="status-opt${S.editorStatus === 'claimed' ? ' sel' : ''}" data-s="claimed">Claimed</div>
      </div>` : ''}

      <div class="fg"><label class="fg-label">Receipt photo</label>
        <input type="file" accept="image/*" id="ei-photo-input" style="display:none">
        <div id="ei-photo-preview" style="${item.receiptPhoto ? '' : 'display:none'}">
          <div class="photo-wrap">
            <img id="ei-photo-img" src="${item.receiptPhoto || ''}" class="photo-preview" alt="">
            <button type="button" id="ei-photo-remove" class="photo-remove">✕</button>
          </div>
        </div>
        <button type="button" id="ei-photo-add" class="photo-add" style="${item.receiptPhoto ? 'display:none' : ''}">📷 Add receipt photo</button>
      </div>

      <button class="btn-main" id="ei-save-btn">${S.editorMode === 'add' ? 'Add Item' : 'Save Changes'}</button>
      <div style="height:8px"></div>
    </div>
  </div>`;
}

// ─── Detail sheet ─────────────────────────────
function renderDetailSheet() {
  const item = S.detailItem;
  if (!item) return `<div class="overlay" id="detail-sheet"><div class="sheet"></div></div>`;
  const mfgD = daysUntil(item.mfgExpiry);
  const ccD  = item.ccExpiry ? daysUntil(item.ccExpiry) : null;

  return `
  <div class="overlay" id="detail-sheet">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-hdr-row">
        <div style="flex:1">
          <div style="font-size:17px;font-weight:600">${esc(item.name)}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(item.store || '')}${item.purchaseDate ? ' · ' + fmtDate(item.purchaseDate) : ''}</div>
        </div>
        <button class="ico-btn" id="det-edit" style="color:var(--accent)">✏️</button>
        <button class="ico-btn" id="det-close" style="font-size:14px;color:var(--text-secondary)">✕</button>
      </div>

      <div style="padding:14px 16px 0">
        <div class="witem-badges" style="margin-bottom:0">
          ${item.status === 'claimed' ? `<span class="badge badge-claimed">✓ Claimed</span>` :
            daysUntil(bestExpiry(item)) < 0 ? `<span class="badge badge-expired">Expired</span>` :
            daysUntil(bestExpiry(item)) <= 90 ? `<span class="badge badge-expiring">⚠ ${daysUntil(bestExpiry(item))}d left</span>` :
            `<span class="badge badge-active">Active</span>`}
          ${item.cardNickname ? `<span class="badge badge-cc">💳 ${esc(item.cardNickname)}</span>` : ''}
        </div>
      </div>

      <div class="detail-section" style="margin-top:16px">
        <div class="detail-section-hdr">Purchase</div>
        <div style="background:var(--bg-secondary);border-radius:var(--r-sm);overflow:hidden">
          ${item.price ? detailRow('Price paid', '$' + item.price.toFixed(2)) : ''}
          ${item.purchaseDate ? detailRow('Date', fmtDate(item.purchaseDate)) : ''}
          ${item.store ? detailRow('Store', item.store) : ''}
          ${item.serialNumber ? detailRow('Serial #', item.serialNumber) : ''}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-hdr">Warranty Coverage</div>
        <div style="background:var(--bg-secondary);border-radius:var(--r-sm);overflow:hidden">
          ${detailRow('Mfg warranty', `${item.mfgWarrantyYears}yr → ${fmtDate(item.mfgExpiry)}`, mfgD < 0 ? 'var(--danger)' : mfgD <= 90 ? 'var(--warning)' : 'var(--success)')}
          ${item.ccExpiry ? detailRow('CC extended', `${item.ccExtraYears}yr → ${fmtDate(item.ccExpiry)}`, ccD < 0 ? 'var(--danger)' : ccD <= 90 ? 'var(--warning)' : 'var(--accent)') : detailRow('CC coverage', 'No card linked', 'var(--text-muted)')}
        </div>
      </div>

      ${item.notes ? `
      <div class="detail-section">
        <div class="detail-section-hdr">Notes</div>
        <div style="background:var(--bg-secondary);border-radius:var(--r-sm);padding:12px 14px;font-size:14px;line-height:1.5">${esc(item.notes)}</div>
      </div>` : ''}

      ${item.receiptPhoto ? `
      <div class="detail-section">
        <div class="detail-section-hdr">Receipt</div>
        <img src="${item.receiptPhoto}" class="detail-photo" alt="Receipt">
      </div>` : ''}

      <div style="height:8px"></div>
    </div>
  </div>`;
}

function detailRow(lbl, val, valColor = '') {
  return `<div class="detail-row" style="padding:10px 14px">
    <div class="detail-lbl">${lbl}</div>
    <div class="detail-val"${valColor ? ` style="color:${valColor}"` : ''}>${val}</div>
  </div>`;
}

// ─── Card editor sheet ────────────────────────
function renderCardSheet() {
  const card = S.cardEditorItem || {};
  const networks = ['Visa', 'Mastercard', 'Amex', 'Other'];
  return `
  <div class="overlay" id="card-sheet">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-hdr-row">
        <div style="flex:1;font-size:17px;font-weight:600">${S.cardEditorMode === 'add' ? 'Add Card' : 'Edit Card'}</div>
        ${S.cardEditorMode === 'edit' ? `<button class="ico-btn" id="ec-del" style="color:var(--danger)">🗑</button>` : ''}
        <button class="ico-btn" id="ec-save" style="color:var(--accent);font-weight:700;font-size:15px;width:auto;padding:0 4px">Save</button>
      </div>

      <div class="fg"><label class="fg-label">Card nickname</label>
        <input class="finput" id="ec-name" type="text" value="${esc(card.nickname || '')}" placeholder="e.g. TD Visa Infinite" autocorrect="off" autocapitalize="words"></div>

      <div class="fg" style="margin-bottom:4px"><label class="fg-label">Network</label></div>
      <div class="network-grid" id="network-grid">
        ${networks.map(n => `<div class="network-opt${S.cardEditorNetwork === n ? ' sel' : ''}" data-n="${n}">${networkIcon(n)} ${n}</div>`).join('')}
      </div>

      <div class="fg"><label class="fg-label">Extra warranty coverage</label>
        <div class="year-stepper" id="cc-stepper">
          <button class="year-btn" id="cc-minus">−</button>
          <div class="year-val" id="cc-val">${S.cardEditorExtraYears} year${S.cardEditorExtraYears !== 1 ? 's' : ''}</div>
          <button class="year-btn" id="cc-plus">＋</button>
        </div>
      </div>

      <div class="fg"><label class="fg-label">Max claim amount (optional)</label>
        <input class="finput" id="ec-max" type="number" value="${card.maxClaimAmount || ''}" min="0" step="100" placeholder="e.g. 10000"></div>

      <div class="fg"><label class="fg-label">Notes (optional)</label>
        <input class="finput" id="ec-notes" type="text" value="${esc(card.notes || '')}" placeholder="e.g. Electronics only, 1yr max"></div>

      <button class="btn-main" id="ec-save-btn">${S.cardEditorMode === 'add' ? 'Add Card' : 'Save Changes'}</button>
      <div style="height:8px"></div>
    </div>
  </div>`;
}

// ─── Card picker sheet ────────────────────────
function renderCardPickerSheet() {
  return `
  <div class="overlay" id="card-picker-sheet">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Select Card</div>
      <div id="cp-list">
        <div class="ctx-option" id="cp-none">
          <span style="font-size:20px;width:28px;text-align:center">🚫</span>
          <span style="font-size:15px">No card</span>
          ${!S.editorCardId ? `<span style="margin-left:auto;color:var(--accent)">✓</span>` : ''}
        </div>
        ${S.cards.map(c => `
          <div class="ctx-option" data-cpid="${c.id}">
            <span style="font-size:20px;width:28px;text-align:center">${networkIcon(c.network)}</span>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:500">${esc(c.nickname)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">+${c.extraWarrantyYears}yr${c.maxClaimAmount ? ' · Max $' + c.maxClaimAmount.toLocaleString() : ''}</div>
            </div>
            ${S.editorCardId === c.id ? `<span style="color:var(--accent)">✓</span>` : ''}
          </div>`).join('')}
        ${!S.cards.length ? `<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px">No cards in vault. Add one in the Card Vault tab.</div>` : ''}
      </div>
      <div style="height:8px"></div>
    </div>
  </div>`;
}

// ─── Account sheet ────────────────────────────
function renderAccountSheet() {
  return `
  <div class="overlay" id="account-sheet">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Account</div>
      <div style="padding:14px 16px 0">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Signed in as <strong>${esc(S.user?.email || '')}</strong></div>
      </div>
      <div class="code-box">
        <div class="code-val">${(S.householdId || '').slice(-6).toUpperCase()}</div>
        <div class="code-hint">Share this code so your partner can join</div>
      </div>
      <button class="btn-main" id="acc-theme" style="background:var(--bg-secondary);color:var(--text);margin-top:14px">${S.theme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}</button>
      <button class="btn-main" id="acc-signout" style="background:var(--danger-bg);color:var(--danger);margin-top:10px">Sign Out</button>
      <div style="height:8px"></div>
    </div>
  </div>`;
}

// ─── Filter pills CSS (injected inline since small) ──
const filterStyle = document.createElement('style');
filterStyle.textContent = `.filter-pill{padding:6px 14px;border-radius:20px;font-size:13px;font-weight:500;background:var(--bg-card);color:var(--text-secondary);border:.5px solid var(--border);white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .12s;flex-shrink:0}.filter-pill.active{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}.filter-pill:active{opacity:.7}.ctx-option{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:.5px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s}.ctx-option:last-child{border-bottom:none}.ctx-option:active{background:var(--bg-secondary)}`;
document.head.appendChild(filterStyle);

// ═══════════════════════════════════════════
// BIND
// ═══════════════════════════════════════════
function bind() {
  switch (S.screen) {
    case 'auth': bindAuth(); break;
    case 'main': bindMain(); break;
  }
}

function bindAuth() {
  on('a-submit', 'click', doAuth);
  on('a-toggle', 'click', e => { e.preventDefault(); S.authMode = S.authMode === 'signin' ? 'signup' : S.authMode === 'join' ? 'signin' : 'signin'; render(); });
  on('a-join-btn', 'click', () => { S.authMode = 'join'; render(); });
  qAll('.auth-inp').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); }));
}

async function doAuth() {
  const btn = q('a-submit'), err = q('a-err');
  if (!btn) return;
  err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    if (S.authMode === 'join') {
      const code = q('a-code').value.trim().toUpperCase();
      if (code.length !== 6) throw { message: 'Please enter a valid 6-digit code' };
      S.pendingHouseholdCode = code; S.authMode = 'signup'; render(); return;
    }
    const email = q('a-email').value.trim(), pass = q('a-pass').value;
    if (S.authMode === 'signup') {
      const name = (q('a-name')?.value.trim()) || 'Member';
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (S.pendingHouseholdCode) {
        const snap = await getDocs(fsQ(collection(db, 'households'), where('code', '==', S.pendingHouseholdCode)));
        if (!snap.empty) {
          const hid = snap.docs[0].id;
          await setDoc(doc(db, 'users', cred.user.uid), { householdId: hid, name, email, createdAt: serverTimestamp() });
          S.pendingHouseholdCode = null; return;
        }
      }
      const code = rndCode();
      const hRef = await addDoc(collection(db, 'households'), { code, createdBy: cred.user.uid, createdAt: serverTimestamp() });
      await setDoc(doc(db, 'users', cred.user.uid), { householdId: hRef.id, name, email, createdAt: serverTimestamp() });
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (e) {
    err.textContent = e.message || 'Something went wrong'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = S.authMode === 'signin' ? 'Sign In' : S.authMode === 'signup' ? 'Create Account' : 'Join Household';
  }
}

function bindMain() {
  // Tab bar
  qAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    haptic('light'); closeSheets(); goTab(btn.dataset.tab);
  }));

  // Header buttons
  on('h-theme', 'click', () => { setTheme(S.theme === 'dark' ? 'light' : 'dark'); render(); });
  on('h-account', 'click', () => openSheet('account-sheet'));
  on('h-add', 'click', () => openItemEditor('add', {}));
  on('h-add-all', 'click', () => openItemEditor('add', {}));
  on('h-add-card', 'click', () => openCardEditor('add', {}));

  // Filter pills
  qAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
    S.filterStatus = p.dataset.f; haptic('light'); render();
  }));

  // Item cards
  qAll('.witem').forEach(el => el.addEventListener('click', () => {
    const item = S.items.find(i => i.id === el.dataset.wid);
    if (item) openDetail(item);
  }));

  // CC cards
  qAll('.cc-card').forEach(el => el.addEventListener('click', () => {
    const card = S.cards.find(c => c.id === el.dataset.cid);
    if (card) openCardEditor('edit', card);
  }));

  // Account sheet
  on('acc-theme', 'click', () => { setTheme(S.theme === 'dark' ? 'light' : 'dark'); closeSheets(); render(); });
  on('acc-signout', 'click', doSignOut);

  // Detail sheet
  on('det-close', 'click', closeSheets);
  on('det-edit', 'click', () => { const item = S.detailItem; closeSheets(); setTimeout(() => openItemEditor('edit', item), 50); });

  // Item editor sheet
  bindItemEditor();

  // Card editor sheet
  bindCardEditor();

  // Card picker sheet
  on('cp-none', 'click', () => {
    S.editorCardId = '';
    closeSheets();
    setTimeout(() => {
      openSheet('item-sheet');
      updateCardPickerLabel();
      updateCalcHint();
    }, 50);
  });
  qAll('[data-cpid]').forEach(el => el.addEventListener('click', () => {
    S.editorCardId = el.dataset.cpid;
    closeSheets();
    setTimeout(() => {
      openSheet('item-sheet');
      updateCardPickerLabel();
      updateCalcHint();
    }, 50);
  }));

  bindOverlayClose();
}

function bindItemEditor() {
  on('ei-save', 'click', doSaveItem);
  on('ei-save-btn', 'click', doSaveItem);
  on('ei-del', 'click', doDeleteItem);
  on('ei-card-picker', 'click', () => openSheet('card-picker-sheet'));
  on('mfg-minus', 'click', () => {
    if (S.editorMfgYears > 0.5) {
      S.editorMfgYears = S.editorMfgYears <= 1 ? 0.5 : S.editorMfgYears - 1;
      updateMfgStepper();
    }
  });
  on('mfg-plus', 'click', () => {
    S.editorMfgYears = S.editorMfgYears < 1 ? 1 : Math.min(S.editorMfgYears + 1, 10);
    updateMfgStepper();
  });
  on('ei-photo-add', 'click', () => q('ei-photo-input')?.click());
  on('ei-photo-remove', 'click', () => {
    if (S.editorItem) S.editorItem.receiptPhoto = null;
    const prev = q('ei-photo-preview'); if (prev) prev.style.display = 'none';
    const add = q('ei-photo-add'); if (add) add.style.display = '';
    const img = q('ei-photo-img'); if (img) img.src = '';
    const inp = q('ei-photo-input'); if (inp) inp.value = '';
  });
  const pi = q('ei-photo-input');
  if (pi) pi.addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await compressImage(file, 80000); if (!data) return;
    if (!S.editorItem) S.editorItem = {};
    S.editorItem.receiptPhoto = data;
    const img = q('ei-photo-img'); if (img) img.src = data;
    const prev = q('ei-photo-preview'); if (prev) prev.style.display = '';
    const add = q('ei-photo-add'); if (add) add.style.display = 'none';
  });
  qAll('#status-grid .status-opt').forEach(o => o.addEventListener('click', () => {
    S.editorStatus = o.dataset.s;
    qAll('#status-grid .status-opt').forEach(x => x.classList.remove('sel'));
    o.classList.add('sel');
    haptic('light');
  }));
  // Live calc hint update
  ['ei-date','ei-price'].forEach(id => on(id, 'input', updateCalcHint));
}

function updateMfgStepper() {
  const val = q('mfg-val');
  if (val) val.textContent = `${S.editorMfgYears} year${S.editorMfgYears !== 1 ? 's' : ''}`;
  updateCalcHint();
}

function updateCardPickerLabel() {
  const lbl = q('ei-card-lbl'); if (!lbl) return;
  const selectedCard = S.cards.find(c => c.id === S.editorCardId);
  lbl.textContent = selectedCard ? '💳 ' + selectedCard.nickname : 'No card selected';
}

function updateCalcHint() {
  const hint = document.querySelector('#item-sheet .calc-hint');
  if (!hint) return;
  const pd = q('ei-date')?.value || todayStr();
  const mfgExp = addYears(pd, S.editorMfgYears);
  const selectedCard = S.cards.find(c => c.id === S.editorCardId);
  const ccExp = selectedCard ? addYears(pd, S.editorMfgYears + selectedCard.extraWarrantyYears) : null;
  hint.innerHTML = `📅 <strong>Mfg expires:</strong> ${fmtDate(mfgExp)}<br>${ccExp ? `💳 <strong>CC extended to:</strong> ${fmtDate(ccExp)}` : ''}`;
}

function bindCardEditor() {
  on('ec-save', 'click', doSaveCard);
  on('ec-save-btn', 'click', doSaveCard);
  on('ec-del', 'click', doDeleteCard);
  on('cc-minus', 'click', () => {
    if (S.cardEditorExtraYears > 1) { S.cardEditorExtraYears--; updateCCStepper(); }
  });
  on('cc-plus', 'click', () => {
    if (S.cardEditorExtraYears < 5) { S.cardEditorExtraYears++; updateCCStepper(); }
  });
  qAll('#network-grid .network-opt').forEach(o => o.addEventListener('click', () => {
    S.cardEditorNetwork = o.dataset.n;
    qAll('#network-grid .network-opt').forEach(x => x.classList.remove('sel'));
    o.classList.add('sel'); haptic('light');
  }));
}

function updateCCStepper() {
  const val = q('cc-val');
  if (val) val.textContent = `${S.cardEditorExtraYears} year${S.cardEditorExtraYears !== 1 ? 's' : ''}`;
}

// ─── Item CRUD ────────────────────────────────
function openItemEditor(mode, item) {
  S.editorMode = mode;
  S.editorItem = { ...item };
  S.editorCardId = item.cardId || '';
  S.editorMfgYears = item.mfgWarrantyYears || 1;
  S.editorStatus = item.status || 'active';
  render();
  openSheet('item-sheet');
  setTimeout(() => q('ei-name')?.focus(), 380);
}

async function doSaveItem() {
  const name = q('ei-name')?.value.trim(); if (!name) return;
  const store = q('ei-store')?.value.trim() || '';
  const purchaseDate = q('ei-date')?.value || todayStr();
  const price = parseFloat(q('ei-price')?.value) || 0;
  const serialNumber = q('ei-serial')?.value.trim() || '';
  const notes = q('ei-notes')?.value.trim() || '';
  const mfgWarrantyYears = S.editorMfgYears;
  const selectedCard = S.cards.find(c => c.id === S.editorCardId);
  const ccExtraYears = selectedCard ? selectedCard.extraWarrantyYears : 0;
  const mfgExpiry = addYears(purchaseDate, mfgWarrantyYears);
  const ccExpiry  = selectedCard ? addYears(purchaseDate, mfgWarrantyYears + ccExtraYears) : null;
  const receiptPhoto = S.editorItem?.receiptPhoto || null;
  const status = S.editorMode === 'edit' ? (S.editorStatus || 'active') : 'active';

  const data = {
    name, store, purchaseDate, price, serialNumber, notes,
    cardId: S.editorCardId || '',
    cardNickname: selectedCard ? selectedCard.nickname : '',
    mfgWarrantyYears, ccExtraYears,
    mfgExpiry, ccExpiry,
    receiptPhoto, status
  };

  haptic('medium');
  if (DEV) {
    if (S.editorMode === 'add') {
      S.items.push({ id: 'dev-' + Date.now(), ...data });
    } else {
      const idx = S.items.findIndex(i => i.id === S.editorItem.id);
      if (idx >= 0) S.items[idx] = { ...S.items[idx], ...data };
    }
    closeSheets(); render(); return;
  }
  try {
    if (S.editorMode === 'add') {
      await addDoc(col('warrantyItems'), { ...data, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, `households/${S.householdId}/warrantyItems/${S.editorItem.id}`), data);
    }
  } catch (e) { console.error('Save item failed', e); }
  closeSheets();
}

async function doDeleteItem() {
  if (!S.editorItem?.id) return;
  if (!confirm(`Delete "${S.editorItem.name}"? This cannot be undone.`)) return;
  haptic('heavy');
  if (DEV) { S.items = S.items.filter(i => i.id !== S.editorItem.id); closeSheets(); render(); return; }
  try { await deleteDoc(doc(db, `households/${S.householdId}/warrantyItems/${S.editorItem.id}`)); } catch (e) {}
  closeSheets();
}

function openDetail(item) {
  S.detailItem = item;
  render();
  openSheet('detail-sheet');
}

// ─── Card CRUD ────────────────────────────────
function openCardEditor(mode, card) {
  S.cardEditorMode = mode;
  S.cardEditorItem = { ...card };
  S.cardEditorNetwork = card.network || 'Visa';
  S.cardEditorExtraYears = card.extraWarrantyYears || 1;
  render();
  openSheet('card-sheet');
  setTimeout(() => q('ec-name')?.focus(), 380);
}

async function doSaveCard() {
  const nickname = q('ec-name')?.value.trim(); if (!nickname) return;
  const notes = q('ec-notes')?.value.trim() || '';
  const maxClaimAmount = parseFloat(q('ec-max')?.value) || 0;
  const data = {
    nickname, network: S.cardEditorNetwork,
    extraWarrantyYears: S.cardEditorExtraYears,
    maxClaimAmount, notes
  };
  haptic('medium');
  if (DEV) {
    if (S.cardEditorMode === 'add') S.cards.push({ id: 'dev-c-' + Date.now(), ...data });
    else { const idx = S.cards.findIndex(c => c.id === S.cardEditorItem.id); if (idx >= 0) S.cards[idx] = { ...S.cards[idx], ...data }; }
    closeSheets(); render(); return;
  }
  try {
    if (S.cardEditorMode === 'add') {
      await addDoc(col('creditCards'), { ...data, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, `households/${S.householdId}/creditCards/${S.cardEditorItem.id}`), data);
    }
  } catch (e) { console.error('Save card failed', e); }
  closeSheets();
}

async function doDeleteCard() {
  if (!S.cardEditorItem?.id) return;
  if (!confirm(`Delete "${S.cardEditorItem.nickname}"?`)) return;
  haptic('heavy');
  if (DEV) { S.cards = S.cards.filter(c => c.id !== S.cardEditorItem.id); closeSheets(); render(); return; }
  try { await deleteDoc(doc(db, `households/${S.householdId}/creditCards/${S.cardEditorItem.id}`)); } catch (e) {}
  closeSheets();
}

async function doSignOut() {
  S.unsubs.forEach(u => u()); S.unsubs = [];
  await signOut(auth);
  S.user = S.householdId = null; S.items = []; S.cards = [];
  S.authMode = 'signin'; go('auth');
}

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════
function col(name) { return collection(db, `households/${S.householdId}/${name}`); }

async function loadHousehold(hid) {
  S.householdId = hid;
  const iu = onSnapshot(fsQ(col('warrantyItems'), orderBy('createdAt', 'desc')), snap => {
    S.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (S.screen === 'main') render();
  });
  const cu = onSnapshot(fsQ(col('creditCards'), orderBy('createdAt')), snap => {
    S.cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (S.screen === 'main') render();
  });
  S.unsubs.push(iu, cu);
}

// ═══════════════════════════════════════════
// DEV BOOTSTRAP
// ═══════════════════════════════════════════
if (DEV) {
  S.householdId = 'dev-household';
  S.user = { uid: 'dev-user', email: 'dev@local' };
  S.cards = [
    { id: 'c1', nickname: 'TD Visa Infinite', network: 'Visa', extraWarrantyYears: 1, maxClaimAmount: 10000, notes: '' },
    { id: 'c2', nickname: 'Amex Cobalt', network: 'Amex', extraWarrantyYears: 1, maxClaimAmount: 5000, notes: 'Electronics only' },
  ];
  S.items = [
    { id: 'i1', name: 'LG 65" OLED TV', store: 'Costco', purchaseDate: '2024-03-15', price: 1799.99, cardId: 'c1', cardNickname: 'TD Visa Infinite', mfgWarrantyYears: 1, ccExtraYears: 1, mfgExpiry: '2025-03-15', ccExpiry: '2026-03-15', receiptPhoto: null, serialNumber: '9XKZT1234', notes: 'Model: OLED65C3', status: 'active' },
    { id: 'i2', name: 'KitchenAid Mixer', store: 'Best Buy', purchaseDate: '2023-11-20', price: 549.99, cardId: 'c2', cardNickname: 'Amex Cobalt', mfgWarrantyYears: 1, ccExtraYears: 1, mfgExpiry: '2024-11-20', ccExpiry: '2025-11-20', receiptPhoto: null, serialNumber: '', notes: '', status: 'active' },
    { id: 'i3', name: 'Dyson V15 Vacuum', store: 'Dyson.ca', purchaseDate: '2025-01-10', price: 899.99, cardId: 'c1', cardNickname: 'TD Visa Infinite', mfgWarrantyYears: 2, ccExtraYears: 1, mfgExpiry: '2027-01-10', ccExpiry: '2028-01-10', receiptPhoto: null, serialNumber: 'DY-V15-9821', notes: 'Registered on Dyson app', status: 'active' },
    { id: 'i4', name: 'iPhone 15 Pro', store: 'Apple Store', purchaseDate: '2023-09-22', price: 1399.00, cardId: 'c1', cardNickname: 'TD Visa Infinite', mfgWarrantyYears: 1, ccExtraYears: 1, mfgExpiry: '2024-09-22', ccExpiry: '2025-09-22', receiptPhoto: null, serialNumber: 'F2LXM9ABC', notes: '', status: 'active' },
  ];
  go('main');
} else {
  onAuthStateChanged(auth, async user => {
    if (user) {
      S.user = user;
      let ud = await getDoc(doc(db, 'users', user.uid));
      if (!ud.exists()) { await new Promise(r => setTimeout(r, 1500)); ud = await getDoc(doc(db, 'users', user.uid)); }
      if (ud.exists()) { await loadHousehold(ud.data().householdId); go('main'); }
      else { await signOut(auth); go('auth'); }
    } else go('auth');
  });
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function q(id) { return document.getElementById(id); }
function qAll(sel) { return document.querySelectorAll(sel); }
function on(id, ev, fn) { const el = q(id); if (el) el.addEventListener(ev, fn); }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function rndCode() { return Math.random().toString(36).toUpperCase().slice(2, 8); }
function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  navigator.vibrate({ light: 10, medium: 25, heavy: [30, 20, 30] }[type] ?? 10);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addYears(dateStr, years) {
  if (!dateStr || !years) return dateStr;
  const d = new Date(dateStr + 'T12:00:00');
  const wholeYears = Math.floor(years);
  const halfYear = years % 1 >= 0.5;
  d.setFullYear(d.getFullYear() + wholeYears);
  if (halfYear) d.setMonth(d.getMonth() + 6);
  return d.toISOString().split('T')[0];
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const exp = new Date(dateStr + 'T12:00:00');
  const now = new Date(todayStr() + 'T12:00:00');
  return Math.round((exp - now) / 86400000);
}
function bestExpiry(item) {
  if (item.ccExpiry && item.status !== 'claimed') return item.ccExpiry;
  return item.mfgExpiry;
}
function fmtDate(d) { if (!d) return ''; return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtShort(d) { if (!d) return ''; return new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }); }

function networkIcon(n) {
  if (n === 'Visa') return '💙';
  if (n === 'Mastercard') return '🔴';
  if (n === 'Amex') return '💚';
  return '💳';
}
function networkColor(n) {
  const map = {
    Visa:       { bg: '#dbeafe', text: '#1d4ed8' },
    Mastercard: { bg: '#fee2e2', text: '#b91c1c' },
    Amex:       { bg: '#dcfce7', text: '#15803d' },
    Other:      { bg: '#f1f5f9', text: '#475569' },
  };
  return map[n] || map.Other;
}
function itemIcon(name) {
  const l = (name || '').toLowerCase();
  if (l.includes('tv') || l.includes('television') || l.includes('oled')) return '📺';
  if (l.includes('phone') || l.includes('iphone') || l.includes('samsung')) return '📱';
  if (l.includes('laptop') || l.includes('macbook') || l.includes('computer')) return '💻';
  if (l.includes('vacuum') || l.includes('dyson')) return '🌀';
  if (l.includes('fridge') || l.includes('washer') || l.includes('dryer') || l.includes('dishwasher') || l.includes('oven') || l.includes('stove') || l.includes('microwave')) return '🏠';
  if (l.includes('camera')) return '📷';
  if (l.includes('watch') || l.includes('apple watch')) return '⌚';
  if (l.includes('headphone') || l.includes('airpod') || l.includes('speaker')) return '🎧';
  if (l.includes('mixer') || l.includes('blender') || l.includes('kitchenaid')) return '🍳';
  if (l.includes('tablet') || l.includes('ipad')) return '📲';
  return '📦';
}

async function compressImage(file, maxBytes) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height, maxW = 800, maxH = 1200;
      if (w > maxW || h > maxH) { const rs = Math.min(maxW / w, maxH / h); w = Math.round(w * rs); h = Math.round(h * rs); }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = 0.8, data = '';
      do { data = canvas.toDataURL('image/jpeg', q); q -= 0.1; } while (data.length > maxBytes && q > 0.1);
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function openSheet(id) {
  const el = q(id); if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('open'));
}
function closeSheets() {
  qAll('.overlay').forEach(el => {
    el.classList.remove('open');
    setTimeout(() => { if (!el.classList.contains('open')) el.style.display = 'none'; }, 300);
  });
}
function bindOverlayClose() {
  qAll('.overlay').forEach(el => el.addEventListener('click', e => { if (e.target === el) closeSheets(); }));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/warrantytracker/sw.js').catch(() => {});
try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch (_) {}
render();
