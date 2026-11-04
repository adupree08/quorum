# Quorum

A private chapter platform for Greek-letter organizations. One officer dashboard, one member
app, one set of chapter records.

**Live demo:** https://adupree08.github.io/quorum/

Demo chapter is the Tulsa Alumni Chapter of Kappa Alpha Psi Fraternity, Inc. Every name,
headshot, payment and record in it is invented. Nothing here touches real chapter money.

## Running it

No build step, no dependencies to install. It is four static files plus headshots.

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## What is in here

| File | What it holds |
|---|---|
| `index.html` | The shell markup: launcher, mode bar, dashboard frame, phone frame, modal root |
| `shell.js` | Launcher screens, mode routing, identity, live sync. Runs before `app.js` |
| `app.js` | The whole product. Every dashboard view, every app screen, every action |
| `data.js` | The seed chapter: 29 members, 8 committees, 8 events, bills, minutes, service records |
| `app.css` | One white theme. No dark mode by design |
| `img/` | 32 generated headshots, mapped to member ids |

### Three surfaces

Routing is `html[data-mode]`, set by `shell.js` and remembered in `localStorage`:

- `launcher` is the demo code and the eight sign-in profiles
- `dashboard` is the officer web app, full screen
- `app` is the member phone app, full screen

A phone that has never been here lands straight on the profile list, because it arrived by
scanning the code and does not need to be shown the code again.

### The eight profiles

Each one carries the access that office really has. Permissions are enforced in `NAV`
(`app.js`) and checked by `can()`, so the left navigation physically shortens when you switch.

| Brother | Office | Reaches |
|---|---|---|
| Marcus Session | Polemarch | Everything, including settings and handoff |
| Reginald Bankston | Vice Polemarch | Everything except the ledger and chapter settings |
| Darius Hobbs | Keeper of Exchequer | Dues, payment requests, budget, ledger |
| Immanuel Oyelaran | Keeper of Records | Roster, attendance, minutes, votes, Vault |
| Yves Armstrong | Strategus | Attendance, check-in, events |
| Dominic Falls | Guide Right Chair | His committee, its budget line, its events |
| Andre Dupree | Member | Phone only, financial |
| Chidi Nwosu | Member | Phone only, behind on dues |

### Live sync

Inside the Claude artifact runtime the whole chapter record is mirrored to a shared document,
so a change on one device shows up on every other. Served as plain static files there is no
such runtime, `startSync()` falls back to `"This device only"`, and each browser keeps its own
copy. Everything else works identically.

## Money

Fees are modelled on Stripe and shown on every checkout screen: bank 0.8% capped at $5.00,
card 2.9% + $0.30. The chapter subscription is a flat $49 a month and no percentage of
anything the chapter collects.
