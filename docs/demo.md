# Demo walkthrough

## Start the seeded demo

Follow the [Quick Start](../README.md#quick-start) to configure `.env` and launch
the Docker Compose stack. Seed the database:

```bash
npm run db:seed -w apps/api
```

Open [http://localhost:3000](http://localhost:3000) and sign in:

- **Owner:** `admin@deploywatch.dev` / `password123`
- **Admin:** `sarah@deploywatch.dev` / `password123`

These are local demo credentials only. Do not reuse them in a deployed environment.
The seed script resets demo records in its configured database; do not run it against
production data.

## Suggested walkthrough

1. **Dashboard and workflows:** inspect the seeded Storefront Web and Payments Engine
   projects, recent workflow runs, and the failed `CI / Jest & Playwright #143` run.
   Open the run to see its commit and GitHub source link.
2. **Deployments and environments:** open a project and inspect its Production and
   Staging environments and deployment history.
3. **Service health and incidents:** open Services and inspect the healthy Storefront
   Gateway and the down Card Authorization Webhook API. Open the incident to review
   the incident timeline. Seeded service URLs use `httpbin.org`; keep the worker's
   outbound network access in mind when running the demo. In project settings, inspect
   Alert rules to see how an optional project-wide failure threshold overrides each
   service's own setting.
4. **Notifications:** use the bell or Notifications page to inspect seeded alerts.
   Opening an alert marks it read for the current user. Notification read state is
   per-user.
5. **Channel settings:** open Settings → Notifications. The seeded Slack channel is
   disabled and uses a placeholder destination. Add a test channel only if you
   control its destination; use Send test to verify delivery, then disable or delete
   it when finished.
6. **Audit log and access control:** as the owner, inspect Settings → Members and
   Settings → Audit Log. Sign in as the admin account to compare permissions.

## Connect a real GitHub repository (optional)

1. Use a publicly reachable HTTPS URL for the running API. For local development,
   expose the API through a trusted tunnel; the default localhost URL is not
   reachable by GitHub.
2. In DeployWatch, create/open a project, link its GitHub repository, and copy the
   webhook URL and one-time secret shown after linking.
3. In GitHub, open the repository's **Settings → Webhooks → Add webhook**. Set the
   Payload URL to the DeployWatch URL, content type to `application/json`, and the
   secret to the copied value. Select `workflow_run` and `deployment_status` events.
4. Trigger a workflow run in GitHub and inspect its delivery response, then check
   DeployWatch Workflow Runs and Deployments.

The demo seed includes a disabled placeholder Slack channel; it will not send
notifications. Never paste a real webhook URL or secret into screenshots, logs, or
source control.
