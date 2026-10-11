# Dedicated QA organization: fixture-data specification

**Status: final specification, v1.0 (2026-10-11).** Creating the organization and seeding data are **not yet
authorized**. SNTS-180 and SNTS-136 stay **Blocked** until the QA owner approves creation and the verification in §6
passes. Agents do not create organizations, accounts or observations, and do not modify existing staging records. The
automation only reads this data.

**Summary of what is needed**

- 1 organization: `QA-Automation`.
- 1 QA client-admin account.
- At least 25 synthetic observations:
  - at least 21 inside a 12-month window, so 3 pages at the page size of 10;
  - at least 2 inside the last 7 days, refreshed;
  - at least 1 submitted by the QA client admin.
- All free text uses the `QA … NN` placeholders.
- Clean-up deletes the organization, or only the tagged records.

## 1. Organization

| Item | Value |
|---|---|
| Name and slug | `QA-Automation` / `qa-automation` (or the owner's choice; tell us the name) |
| Branding | None; default logos |
| Module access | Same defaults as a normal client organization: Pre-start Observation, Training, Guides |
| Purpose | Read-only regression fixtures for SNTS-180, SNTS-136 and SNTS-117. No customer data |

## 2. Accounts

| Env vars (local `.env` only) | Role | In org | Used by |
|---|---|---|---|
| `SENTIS_QA_CLIENT_ADMIN_EMAIL` / `_PASSWORD` | Client admin | QA-Automation | SNTS-180 (View popup), SNTS-117 (My Observations → Observation Details) |
| Existing `SENTIS_SUPER_ADMIN_*` | Super admin | n/a | SNTS-136 (PST Reports → Recent Observations, organization QA-Automation) |
| Optional: `SENTIS_TEAM_USER_*` | Team user | QA-Automation | Only if the SNTS-242 answer says the title differs by role |

Email addresses should belong to a QA-controlled mailbox, not a real employee. Passwords go to the agents through the
gitignored `.env` only.

## 3. Observations (synthetic only)

Every free-text field uses obvious placeholder values:

- Observer: `QA Observer NN`
- Leader: `QA Leader NN`
- Location: `QA Site NN`
- Comments: `QA fixture NN`

Here NN = 01, 02, … The values must not be real names, sites or companies.

| Field (as shown in the popups) | Fixture value |
|---|---|
| Meeting date | See the date plan below. **Not** historical years (current staging has 1990s meeting dates, which the date filters exclude) |
| Meeting time | Any |
| Observer role | `Observer` |
| Crew size | 5–20 |
| Overall rating | Spread across Poor, Fair, Neutral, Good and Excellent (at least one of each where the counts allow) |
| Observed behaviours | Any valid responses, with comment `QA fixture NN` |
| Sync status | Synced |

**Date plan.** The client-admin Pre-Start Observation tab offers Last 7 Days, Month, Year and Custom. The default is
Last 7 Days, and Custom is currently broken (SNTS-138/176).

| Purpose | Count | Meeting or submitted date |
|---|---|---|
| SNTS-180: visible under the default "Last 7 Days" | ≥ 2 | Within the last 7 days, **refreshed weekly** (or the owner sets a rolling seed). Otherwise the test falls back to "Month" or "Year" |
| SNTS-180 fallback | ≥ 1 | 10–25 days old (visible under "Month") |
| SNTS-136: pagination | **≥ 21 in total within the last 12 months**, all in QA-Automation | Spread over the last 6 months |
| SNTS-117 | ≥ 1 submitted **by** the QA client admin | Any recent date. "My Observations" lists the signed-in user's own observations |

**Date definition (verified read-only 2026-10-11; strong inference, not confirmed by the developers):** the dashboard
date filters very likely use the **meeting date** (`meetingDate`), not the submitted date (`submittedAt`).

- Both admin lists request one window, `?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`:
  - client admin: `/v1/reporting/tenant-summary`;
  - super admin: `/v1/reporting/organizations/:id/prestart-report`.
- Evidence: the client admin belongs to one organization. Its own 2 observations (`/v1/prestart-observations/me`)
  were submitted in 2026, with meeting dates in 2020 and 1994. The organization's "Year" window
  (`dateFrom` one year ago) still shows "No observations".
- Seeding rule: put **both** the meeting date and the submitted date inside the target window. Ask the developers to
  confirm which field the filter uses.

## 4. Pagination sizing (SNTS-136)

- **Page size: 10 rows** for Super Admin → PST Reports → "Recent Observations - {organization}". This comes from
  static reading of the deployed staging bundle (`index-BDcNUbZY.js`, 2026-10-11): the page count is
  `ceil(rows / 10)`, and the page slice is `rows.slice((page-1)*10, page*10)`.
- The other observation lists in the bundle also use 10. The UI could not show it, because no organization has
  more than one page today.
- Pagination is **client-side**. `prestart-report` returns every observation in the window in one array, with no
  page parameters. The test therefore needs the rows to exist in the window; no server paging is involved.
- Requirement: at least 2 × page size + 1 rows in the selected window, which gives 3 pages, so Next, Previous and
  the page indicator can all be checked. **21 is the minimum; 25 gives margin.**
- The test still reads the page size at run time, from the first page's row count, because the bundle can change.
  It skips with "needs ≥ 2×page size + 1 observations in QA-Automation" if there are too few.

## 4a. Role access (verified 2026-10-11)

| View | Role | Scope |
|---|---|---|
| Client Admin → Pre-Start Observation (`?admin=client&tab=observations`) | Client admin of the organization | That organization's observations in the date window. View opens the "Observation for …" popup (SNTS-180) |
| Home → My Observations | Any signed-in user | Only the user's own submissions (`/me`). View opens "Observation Details" (SNTS-117) |
| Super Admin → PST Reports → Recent Observations | Super admin | Any organization, chosen in the organization selector. The selection is not persisted (a reload resets it) |
- The `QA Site NN` locations make each page's rows distinguishable without reading any personal data.

## 5. Rules

- No real customer data. No edits to existing organizations, users or observations.
- Seeding is done by the data owner, through the UI or a script. Agents never create or change these records.
- The fixtures are persistent and read-only for the tests. If they must be refreshed (the 7-day window), the data
  owner does it. Tell us if a refresh is not possible, and the test will use the "Month" range instead.
- Clean-up and retention are owned by the data owner. Tell us before the org is removed, so the tests can be marked
  `blocked` rather than failing.

**Safe creation strategy (recommended order):**

1. The super admin creates the `QA-Automation` organization (Manage → Create Organisation). This is a cross-company
   action, so it needs the QA owner's approval. Approved domains: none, so no emails are sent.
2. Create the QA client-admin account without inviting a real mailbox, for example a QA-controlled address, or
   the developers seed it directly.
3. Observations: the preferred option is a **developer seed script** run against staging. It can set
   `meetingDate` and `submittedAt` explicitly, which the UI cannot. The fallback is for the QA client admin to
   submit them through New Observation, which sets `submittedAt` to now and the meeting date as entered.
4. Tag every free-text field `QA fixture NN`, so the records are identifiable and safe to delete.

**Controlled clean-up** (data owner, with the QA owner's approval):

1. **Inventory first.** Count the records to be removed, selected by `QA Site NN` location and `QA fixture NN`
   comment within the `QA-Automation` organization. The count must match the seed log (number seeded, plus any
   weekly refreshes).
2. **Dry run.** The seed or cleanup script prints the IDs and counts only, and deletes nothing.
3. **Delete** either the whole `QA-Automation` organization (observations and accounts with it) or exactly the
   inventoried IDs. Never delete by date, by rating, or by an organization-name pattern alone. Never touch records
   outside `QA-Automation`.
4. **Verify.** The count is zero, other organizations' counts are unchanged, and the QA client-admin account is
   removed or disabled.
5. **Record** who, when, what and the counts in the seed log. Tell the lead first, so SNTS-180, SNTS-136 and the
   SNTS-117 fixture are set back to `blocked` rather than failing.

## 6. Verification once seeded (lead, read-only)

1. Sign in as the QA client admin. On the Pre-Start Observation tab, with "Last 7 Days", at least 1 row has View.
   Open one popup, then close it.
2. On My Observations, at least 1 row. Open Observation Details, then close it.
3. As super admin, on PST Reports, select QA-Automation and the range used by SNTS-136. Pagination controls are
   present, and there are at least 3 pages.
4. Record the measured page size in this file and in `requirements-gaps.md`. Then mark SNTS-180 and SNTS-136 `ready`.
