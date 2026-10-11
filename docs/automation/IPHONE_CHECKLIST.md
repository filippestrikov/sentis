# Manual iPhone verification checklist

**Purpose:** confirm, on a real iPhone, the tests that are automated only in Chromium device emulation
(`coverage_scope` = `emulation-only` or `desktop+emulation`). Emulation is not iOS Safari. Until someone has run a
row on a physical device, the matrix keeps it as emulation-only.

**Device:** iPhone 15 Pro Max with Safari (the device in the tickets), on the latest iOS available. Record the iOS
version. SNTS-94 also lists an iPhone 13 and an iPad Mini; use them if you have them.

**Before you start**

- Staging: https://sam.sentis.com/. Sign in with the QA owner's super-admin or client-admin account. Credentials
  never go in this file or in the results.
- Light theme, unless the row says otherwise. Portrait, with no zoom and default text size.
- **Privacy:** do not screenshot pages that show people: Manage, Inspect Users table, User Details, Audit Logs,
  Prompt History, observation lists. Where a capture is useful, crop it to the dialog or control named in the row.
- Do not submit forms, send invitations, save edits or send SAM AI messages. Close every dialog with its Close or
  Cancel button.

**How to record:** fill in the Result column with Pass, Fail or Not run, plus a short note. Give the date and
tester at the end. A row only becomes "real-device verified" in the matrix when the QA owner records it there.

| # | Jira | Role | Steps | Expected (what the automated test checks) | Emulation result | Result on iPhone |
|---|---|---|---|---|---|---|
| 1 | SNTS-251 | Client admin | Home → tap **Open SAM AI Coach**. Tap the input and type a word (do not send), then clear it. Tap **Close SAM AI Coach** | Panel fits the screen. The X is visible and closes the panel. The input stays reachable and visible while the keyboard is open. Note any second X | Pass | |
| 2 | SNTS-197 | Client admin | Home → tap the menu (☰) → scroll the sidebar to the bottom | **Log Out** is fully visible and tappable inside the sidebar (do not tap it). The sidebar closes with X | Pass | |
| 3 | SNTS-167 | Client admin | Menu → **New Observation** → tap the development guide / competency framework button | Guide dialog header is fully visible, and the X does not cover the title | Pass | |
| 4 | SNTS-182 | Client admin | Client Admin → **Training**, scroll well down → tap **Guides** | Guides content starts at the top, not mid-page | Pass | |
| 5 | SNTS-161 | Client admin | Toggle theme to **dark** → menu (☰) | The sidebar X is clearly visible. Note whether you can see it without effort. Toggle back to light afterwards | Fail (≈1.15:1, needs 3:1) | |
| 6 | SNTS-94 | Signed out | Sign-in page → **Terms and Conditions**. Scroll the text top → middle → bottom | The X never covers visible text at any scroll position, and closes the dialog | Pass | |
| 7 | SNTS-156 | Signed out | Sign-in page → header **Super Admin** | Dialog fits the screen. The X does not cover the "Sentis Super Admin" heading. All controls are inside the dialog | Fail (X overlaps heading) | |
| 8 | SNTS-183 | Client admin | Client Admin → **Inspect Users** → **Invite Team Leader** (do not create) | Dialog fits. The X does not cover the "Invite Tenant User" title. Every field and button is reachable | Fail (X over title) | |
| 9 | SNTS-140 | Client admin | Same dialog as row 8 | The X does not touch the "Invite a user into …" subheading | Fail | |
| 10 | SNTS-176 | Client admin | Client Admin → range selector → **Custom** → **Pick dates** | The whole calendar, including the "To" month, fits on screen or can be scrolled to | Fail (calendar below viewport) | |
| 11 | SNTS-205 | Super admin | Super Admin → **Training** → **New Module** → **Cancel** | The X does not cover the "New Training Module" title. Buttons are inside the dialog | Fail | |
| 12 | SNTS-209 | Super admin | Super Admin → **Training** → **Edit** on any module → **Cancel** | The X does not cover the "Edit Training Module" title | Fail | |
| 13 | SNTS-204 | Super admin | Super Admin → **SAM AI**, then each other admin tab. Scroll each section horizontally | No content is cut off at the right edge. Clipping was seen in Prompt History, Knowledge Uploads, Organization Access Requests and Tenant Users. **Do not screenshot these sections** (they show people) | Fail (clipping) | |

Notes for the reviewer:

- A row that passes on the iPhone but fails in emulation (or the reverse) is a finding. Report it before anyone
  changes a test.
- SNTS-242 and SNTS-206 are not on this list. They are requirement questions, not device questions.

Tester: ____________  Date: ____________  iOS: ____________  Device: ____________
