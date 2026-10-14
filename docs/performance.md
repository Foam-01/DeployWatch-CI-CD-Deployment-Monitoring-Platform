# Dashboard API performance benchmark

The opt-in benchmark measures the authenticated HTTP API, including NestJS
middleware, JSON serialization, and PostgreSQL queries. It checks both dashboard
endpoints individually and the two requests concurrently as the dashboard loads
them. Each metric has five warm-up requests followed by 30 measured samples. The
nearest-rank p50 and p95 and the maximum latency are printed as JSON.

## Workload and budget

The benchmark creates a fixed dataset in a disposable PostgreSQL database:

- 10 projects, repositories, and production environments
- 20,000 workflow runs and 5,000 deployments, distributed across 90 days
- 100 monitored services and 50 incidents

Each measured metric must have p95 latency **below 500 ms**. This is a local
development benchmark, not a production SLA; results depend on the host, Docker,
and PostgreSQL resources. The benchmark is intentionally not part of CI because
shared-runner load makes strict latency thresholds noisy.

## Recorded local run

One run on Windows x64 with Node.js 24.11.1 and the disposable PostgreSQL 16.4
Docker test database produced the following results using the workload above:

| Metric | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Dashboard overview | 64.43 ms | 175.31 ms | 184.97 ms |
| Dashboard analytics | 23.77 ms | 50.01 ms | 80.82 ms |
| Overview and analytics concurrently | 61.06 ms | 190.17 ms | 195.63 ms |

All three p95 measurements were below the 500 ms target in this run. This is a
single local measurement, not a guarantee for other machines or deployments.

## Run on Windows PowerShell

> The benchmark truncates application tables before and after the run. Use only
> the dedicated disposable test database below. Never point it at development or
> production data.

```powershell
npm run test:db:up
$env:TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/deploywatch_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run db:migrate:prod --workspace=apps/api
npm run benchmark:dashboard --workspace=apps/api
docker compose -f docker-compose.test.yml stop
Remove-Item Env:DATABASE_URL
Remove-Item Env:TEST_DATABASE_URL
```

The script verifies that its database is local and its database name contains
`test`; it refuses to run otherwise. It creates the test organization, user, and
load fixture itself, then clears the disposable database in a `finally` block.
The JSON output includes the workload, runtime environment, and measured latencies.
