# Individual panelist feedback

Open a candidate → Interviews → Individual panelist feedback. Pick the panelist's **Create feedback link**, copy it and share it privately. There is no automatic email transmission. Each link shows only the candidate name, job title, interview round/time and the named panelist. It accepts a rating, a shortlist/proceed, hold or reject recommendation, and comments.

A cloud link expires in seven days and accepts one submission. Replace a pending link to invalidate its previous URL, or revoke it. Submitted responses are read-only. Anyone holding the link can submit as its named panelist, so it must be sent only to that person. Only hashes are stored; plaintext tokens stay in the share URL fragment and POST body.

The existing recruiter feedback box and hiring-stage decisions remain separate. Submitted responses appear beside the interview, in the Panelists tracker and in the Dashboard Excel export. Workspace refreshes pick them up within about ten seconds while visible, and on focus. Reassigning a job transfers review access to its new responsible recruiter; active admins can review across jobs. Other recruiters and anonymous database clients cannot read feedback or link hashes.

## Database and hosting

For an existing HireLens database with the assignment migration installed, apply `supabase/panel-feedback.sql` as a transaction, then deploy this code to the existing Vercel project. The full schema also contains the idempotent migration. It creates a separate table, policies and service-only functions; existing candidate and interview documents are preserved. No new API keys, email provider or external service is needed.

Without the migration, signed-in workspaces show “Panelist feedback database setup is pending.” Existing workspace functionality remains available. The public route is `/feedback#<random-token>`; Vercel rewrites it to the app with no-referrer, no-store and noindex headers.

The `/demo` workspace creates explicitly labelled preview links using browser-local sample data. They work only in that same browser and never write to the client database.

## Verification

`node --test tests/*.test.mjs` covers permissions, reassignment, token replacement, expiry/revocation, duplicate submissions, validation, deleted interviews/candidates, independent responses and analytics attribution. Run `npm run typecheck` and `npm run build`. Browser-check a preview submission, reload, and confirm the response appears in the candidate interview and Panelists tracker without changing the final hiring stage.
