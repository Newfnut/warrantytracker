# WarrantyVault — Project Documentation
*For Claude: read this file at the start of every session before making any changes.*

---

## Project overview

A shared household warranty tracker PWA built for Gary and his wife, primarily used on iPhone 14. Deployed to GitHub Pages. Real-time sync via Firebase Firestore so both phones update live.

**Live URL:** https://newfnut.github.io/warrantytracker
**Repo:** https://github.com/newfnut/warrantytracker
**Deploy:** GitHub Pages (branch: main, root folder)

---

## Firebase config

```js
const fbConfig = {
  apiKey: "AIzaSyATdyW05921fNz_wyZ3zjYVF4o44mm_tyg",
  authDomain: "hallarc.firebaseapp.com",
  projectId: "hallarc",
  storageBucket: "hallarc.firebasestorage.app",
  messagingSenderId: "1057782930491",
  appId: "1:1057782930491:web:b54109ac07001be634501e",
  measurementId: "G-RDCJCLSQ5X"
};
```

**Firebase SDK version:** 10.7.1 (imported via ESM from gstatic CDN)

---

## File structure

```
index.html   — shell: <head> meta, empty #app div, links styles.css + app.js
styles.css   — all CSS; CSS variables throughout
app.js       — all application logic as ES module; Firebase ESM imports at top
sw.js        — service worker for offline caching
manifest.json — PWA manifest
CLAUDE.md    — this file
```

Flat directory. No build step, no bundler.

---

## Firestore data model

```
households/{householdId}/
  warrantyItems/{itemId}
    name              — item name (e.g. "LG 65" TV")
    store             — where purchased (e.g. "Costco")
    purchaseDate      — YYYY-MM-DD
    price             — float
    cardId            — string, ref to creditCards doc id (or '' if none)
    cardNickname      — denormalized card name for display
    mfgWarrantyYears  — float (e.g. 1, 2, 0.5)
    ccExtraYears      — float from card (e.g. 1)
    mfgExpiry         — YYYY-MM-DD (calculated)
    ccExpiry          — YYYY-MM-DD (calculated, null if no card)
    receiptPhoto      — base64 string or null
    serialNumber      — string
    notes             — string
    status            — 'active' | 'expired' | 'claimed'
    createdAt         — serverTimestamp

  creditCards/{cardId}
    nickname          — e.g. "TD Visa Infinite"
    network           — 'Visa' | 'Mastercard' | 'Amex' | 'Other'
    extraWarrantyYears — float (typically 1)
    maxClaimAmount    — float (e.g. 10000)
    notes             — string
    createdAt         — serverTimestamp

users/{uid}
  householdId, name, email, createdAt

households/{householdId}
  code (6-char uppercase), createdBy, createdAt
```

---

## Household sharing model

Identical to Haul & Paws:
- First user creates account → new `households` doc, code generated
- Second user signs up + enters 6-char code → linked to same householdId
- All data under `households/{householdId}/` so both see identical state

---

## Auth

Email/password via Firebase Auth. Same flow as Haul & Paws.
Firestore security rules: simple `request.auth != null` checks — no get()-based membership lookups.

---

## App screens / flow

- **loading** → **auth** → **dashboard** → item detail sheet
- **dashboard** — expiring soon (≤90 days), all active items
- **vault** — credit card manager (add/edit/delete cards)
- Item add/edit sheet — full form with photo, card picker, warranty calc
- Status: active | expired | claimed

---

## Key calculated fields

```js
mfgExpiry  = purchaseDate + mfgWarrantyYears (in years)
ccExpiry   = purchaseDate + mfgWarrantyYears + ccExtraYears
```

Both stored as YYYY-MM-DD strings on save so no recalc needed at read time.

---

## Dev mode

```
open index.html?dev=1
```
Bypasses Firebase auth, loads mock data. All writes go to local S.items array.

---

## Architecture

Single-page app pattern identical to Haul & Paws:
- One `S` state object
- `render()` → re-renders based on `S.screen`
- `renderX()` returns HTML string → `innerHTML` → `bindX()` attaches listeners
- `go(screen)` switches screens

## Style / conventions

- No framework. Vanilla JS ES modules only.
- CSS variables for everything. Never hardcode colors in JS.
- iOS-native feel. Font: `-apple-system, BlinkMacSystemFont, 'SF Pro Display'`
- Return only changed functions/blocks, not entire file
- Label changes: e.g. `app.js → renderDashboard()`, `styles.css → .item-card`
- For small changes use find/replace pairs with exact old → new text
- Do not remove DEV mode blocks

---

## Phase 2 (deferred)

- Push notification reminders before expiry
- CSV export
- Barcode scanner for serial numbers
- Link from Haul & Paws completed trips
