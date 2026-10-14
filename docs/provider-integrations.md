# GitHub, GitLab, and Jenkins integrations

Repository integrations are managed from a project's **CI/CD integrations** card.
Only organization owners and admins can discover, link, sync, or unlink providers.
Every integration is scoped to its project and organization.

## GitHub

Link the repository using its `owner/name` and numeric repository ID. Configure a
GitHub webhook with the URL shown after linking, content type `application/json`,
the one-time secret, and the `workflow_run` and `deployment_status` events.
Deliveries are authenticated against the raw request body and deduplicated by
GitHub's delivery ID.

## GitLab

1. Create a Personal Access Token or Project Access Token with the `read_api`
   scope and access to the projects you intend to link.
2. Choose GitLab in DeployWatch, enter the HTTPS base URL and token, then discover
   and link projects. Public GitLab uses `https://gitlab.com`; self-managed
   installations can use their public HTTPS URL.
3. In GitLab, add a project webhook using the displayed DeployWatch URL and the
   one-time secret as **Secret token**. Enable **Pipeline events** and
   **Deployment events**.
4. DeployWatch authenticates `X-Gitlab-Token`, deduplicates the GitLab event UUID
   (or a hash of the raw body), and maps pipeline/deployment hooks to workflow
   runs and deployments.
5. Use **Sync recent runs** to import up to the 100 most recent pipelines.

## Jenkins

1. Create a Jenkins user and API token with read permissions for the folders/jobs
   to be linked.
2. Choose Jenkins in DeployWatch, enter the HTTPS base URL, username, and API
   token, then discover and link jobs. Nested folders are supported.
3. Install/configure the **Generic Webhook Trigger** plugin or call the displayed
   endpoint from a Jenkins Pipeline. For builds, send a JSON body with
   `build_number`, `build_status`, `build_url`, and `git_commit`; optionally
   include `git_branch`, `job_name`, `timestamp`, and `completed_at`. For
   deployments, send `deployment_id`, `deployment_status`, `environment`, and
   `git_commit`; optionally include `started_at`, `completed_at`, `deployment_url`,
   and `build_url`.
4. Sign the exact raw request bytes using the one-time secret and HMAC-SHA256.
   Send the result as `X-DeployWatch-Signature: sha256=<lowercase hex digest>`,
   and set `X-DeployWatch-Event` to `build` or `deployment`. The optional
   `X-DeployWatch-Delivery` header provides an explicit idempotency key; when
   omitted, DeployWatch hashes the raw body.
5. Use **Sync recent runs** to import up to the 100 most recent builds.

Example signing command on a Jenkins agent with OpenSSL:

```sh
signature="sha256=$(openssl dgst -sha256 -hmac "$DEPLOYWATCH_SIGNING_SECRET" build.json | awk '{print $2}')"
curl --fail-with-body --request POST "$DEPLOYWATCH_WEBHOOK_URL" \
  --header "Content-Type: application/json" \
  --header "X-DeployWatch-Signature: $signature" \
  --header "X-DeployWatch-Event: build" \
  --data-binary @build.json
```

Store the signing secret as a masked Jenkins credential; never print it in build
logs. Use a fresh JSON file for each delivery because the signature covers exact
bytes.

## Credential and network security

GitLab access tokens and the Jenkins username/API-token pair are encrypted with
the configured `ENCRYPTION_KEY`. They are never returned by API responses; the
webhook secret is shown only once at link time. Replace provider credentials by
unlinking and reconnecting the integration.

Provider API URLs must use HTTPS and resolve exclusively to public IP addresses.
The socket lookup repeats the address check at connection time, redirects are not
followed, responses are limited to 1 MB, and requests time out after 10 seconds.
This permits public self-managed installations while blocking loopback, private,
link-local, metadata, and other reserved network destinations. An installation
available only on a private network is intentionally unsupported to prevent SSRF.

API synchronization imports at most the latest 100 workflow runs per manual
request. Webhooks remain the recommended way to keep status changes current.
