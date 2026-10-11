# Dedicated QA organization: fixture-data specification

**Status:** a request to the QA owner or data owner. Agents do not create organizations, accounts or observations,
and do not modify existing staging records. The automation only reads this data.

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

**Open point for the data owner:** do the dashboard date filters use the meeting date or the submitted date?
Current staging shows observations submitted in 2026 with meeting dates in 1994 and 1997, and the filters hide them.
Set both dates inside the window to be safe.

## 4. Pagination sizing (SNTS-136)

- The page size has **not** been measured. With today's data, Recent Observations (Super Admin → PST Reports)
  shows one page and no pagination controls. Earlier notes assumed 10 rows per page.
- Requirement: the count in the selected range must be at least 2 × page size + 1. That gives at least three pages,
  so Next, Previous and the page indicator can all be checked. With 10 rows per page, 21 is the minimum; 25 gives
  margin.
- The Batch 5 test will read the page size at run time, from the first page's row count. It skips with "needs
  ≥ 2×page size + 1 observations in QA-Automation" if there are too few, rather than hard-coding 10.
- The `QA Site NN` locations make each page's rows distinguishable without reading any personal data.

## 5. Rules

- No real customer data. No edits to existing organizations, users or observations.
- Seeding is done by the data owner, through the UI or a script. Agents never create or change these records.
- The fixtures are persistent and read-only for the tests. If they must be refreshed (the 7-day window), the data
  owner does it. Tell us if a refresh is not possible, and the test will use the "Month" range instead.
- Clean-up and retention are owned by the data owner. Tell us before the org is removed, so the tests can be marked
  `blocked` rather than failing.

## 6. Verification once seeded (lead, read-only)

1. Sign in as the QA client admin. On the Pre-Start Observation tab, with "Last 7 Days", at least 1 row has View.
   Open one popup, then close it.
2. On My Observations, at least 1 row. Open Observation Details, then close it.
3. As super admin, on PST Reports, select QA-Automation and the range used by SNTS-136. Pagination controls are
   present, and there are at least 3 pages.
4. Record the measured page size in this file and in `requirements-gaps.md`. Then mark SNTS-180 and SNTS-136 `ready`.
