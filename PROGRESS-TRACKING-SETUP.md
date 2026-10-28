# Progress tracking setup

Progress is stored in the project's existing **Cloud Firestore `(default)` database**, under `users/{uid}/history/{entryId}`. Every event has an `appType` value (`virtual-labs`, `ai-interviews`, or `e-library`), so the three histories stay distinct without requiring additional Firestore databases or Firebase Admin credentials for saves.

The browser writes each event with the signed-in Firebase user and subscribes to that user's history using Firestore realtime listeners. The `firebase.json` deploy target is now the default database shown in the Firebase Console.

## Publish secure Firestore rules

The screenshot shows the default database has temporary rules that allow public access. Replace those rules immediately; do not keep the database open to everyone.

1. In Firebase Console, open **Cloud Firestore → Database (default) → Rules**.
2. Replace the rules with the contents of [`firestore.rules`](./firestore.rules), then click **Publish**. This rule set lets a signed-in user read their own progress and create only valid progress events for their own account. It denies client updates and deletes.

Alternatively, install and authenticate the Firebase CLI, select project `virtual-learning-platfor-1e5ab`, and run this from the repository root:

```powershell
firebase deploy --only firestore --project virtual-learning-platfor-1e5ab
```

The progress save itself does not call `/api/progress`, so an older Node server returning 404 for that endpoint will no longer block a completion or score save. Save requires the default Firestore database to exist, the Firebase sign-in to be active, and the secure rules above to be published.

## Email notifications and weekly summary (optional)

Email notifications are separate from saving progress. They use the Node backend, Firebase Admin credentials, and Resend. For local development, create a Firebase service-account credential with Firestore access and keep its JSON file outside the repository. Set these variables in the same PowerShell window that starts the server:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\firebase-service-account.json"
$env:RESEND_API_KEY = "re_your_key"
$env:RESEND_FROM_EMAIL = "Progress updates <verified-sender@example.com>"
npm start
```

The service identity needs permission to access Firestore (for example, the `Cloud Datastore User` role). In production, prefer the hosting provider's attached service identity instead of a downloaded service-account key. Verify the sender address/domain with Resend. Never commit credentials.

Immediate email notifications are attempted after saving; an email failure does not undo the Firestore save. Weekly summaries cover the previous seven days and run Monday at 09:00 `Asia/Kolkata` while the Node server is running. Phone-only Firebase accounts can save progress but do not have an email address for notifications.

## What the histories represent

- Virtual lab completions are recorded when a signed-in user presses **Mark lab complete**.
- AI Interview history stores the score and grade the current page generates from its built-in report data; it does not execute the edited code to calculate a score.
- The E-Library catalog has no downloadable book files. **Download notes** creates an original blank reading-notes template and records that template, not a catalog textbook.
