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

## Not built yet

### Screenshot and screen-recording restriction

A chapter's reason for leaving the group chat is that screenshots leak. Quorum
should make leaking harder, and make a leak traceable. What is actually
possible differs sharply by platform, so the plan is honest about it.

| Platform | What can be done | Effort |
|---|---|---|
| Android | `FLAG_SECURE` on the window truly blocks screenshots, screen recording and casting. The system shows black. | One line, native |
| iOS | No sanctioned API blocks a screenshot. Officially you only get **detection**: `UIApplication.userDidTakeScreenshotNotification` fires after the fact, and `UIScreen.isCaptured` plus `UIScreen.capturedDidChangeNotification` report recording in real time. | Small, native |
| Web | Nothing. No browser exposes this. The prototype in this repo is a web page, so it cannot be protected at all. | Not possible |

#### The one iOS technique that does block, and why it cannot carry the promise

Checked November 2026. There is still no Apple API for this. The technique
every secure app uses instead is to re-parent the app's window layer into the
canvas layer of a `UITextField` with `isSecureTextEntry = true`. The secure
field is public API; relying on the internal layer tree inside it is not.

If the app is built in Expo or React Native this is already packaged:
`expo-screen-capture`'s `preventScreenCaptureAsync()` does exactly this on
iOS and sets `FLAG_SECURE` on Android, so one call covers both platforms. Its
own iOS source is a `SecureWindowCanvas` doing the secure-field reparenting.

Three things to know before promising a chapter anything:

- **It fails open.** The implementation has to reach inside the text field
  (`textField.layer.sublayers?.first`). If a future iOS changes that internal
  structure, the guard simply does not attach and the app keeps running with
  no protection and no error. There are already reports of it not working on
  some iOS versions. You would not find out; the brothers would.
- **Review risk is unresolved, not cleared.** No documented Apple rejection
  for it, and no Apple blessing either. A developer forum thread asking
  whether it violates Guideline 2.5.1 has no Apple answer.
- **It does nothing for the web build**, which is what exists today.

So treat the block as a bonus that may silently disappear, and keep the
watermark as the defense the product's promise actually rests on.

Because iOS cannot be relied on to block capture, the deterrent has to be
social rather than technical, and that part works everywhere:
technical, and that part works everywhere:

1. **Watermark sensitive screens.** Overlay the viewer's own name and member
   number, low contrast, across chat and any document in the Vault. A leaked
   screenshot then identifies who leaked it. On iPhone this is the only thing
   doing real work, and it is the one GroupMe cannot offer.
2. **Log and notify.** Record a screenshot event against the member and the
   room. Optionally tell the room: "a brother screenshotted this channel."
   Chapters police themselves once the act is visible.
3. **Hide content while recording.** On iOS, `UIScreen.isCaptured` is readable
   in real time, so sensitive views can be swapped for a placeholder for as
   long as a recording is running. Unlike a screenshot, this one can be caught
   before anything is captured.
4. **Blur on backgrounding.** Covers the window when the app leaves the
   foreground, so the app-switcher thumbnail shows nothing readable to someone
   holding the phone.

   **This is not a screenshot defense and must not be sold as one.** It fires
   on app lifecycle events, so it never runs during a screenshot, which is
   taken while the app is still in front. It is lifecycle code rather than
   anything hardware-specific, so it behaves identically on every phone. On
   Android it is redundant: `FLAG_SECURE` already blanks the recents thumbnail.

There is a widely used iOS trick that does block capture: hosting content
inside a `UITextField` layer with `isSecureTextEntry` set. It works today, it
is not sanctioned by Apple, and it has broken across OS releases. Treat it as
optional hardening for the Vault only, never as the thing the promise rests on.

**What to tell a chapter.** Not "nobody can screenshot this." The honest and
stronger line is: on Android it is blocked, on iPhone it is watermarked with
the brother's name and logged, so a leak has a return address. That also keeps
faith with the posture elsewhere in this product, which is private rather than
invisible, since national HQ oversight and the Stop Campus Hazing Act mean a
chapter's records cannot be beyond reach of the organization itself.

This requires a native app. It is not buildable in the current web prototype.
