# Implementation backlog

Repository setup is complete only when local checks, hosted CI, and repository
settings have been verified. Product implementation remains open:

- [ ] Select initial channel/rule behavior, Shorts/live handling, insertion cap,
  ordering, and historical backfill policy with the user.
- [ ] Implement validated rule configuration and synthetic filtering fixtures.
- [ ] Implement durable candidate states, deduplication, and write reconciliation.
- [ ] Implement OAuth callback, token storage, refresh, revocation, and reconnect.
- [ ] Implement paginated subscription synchronization and import support.
- [ ] Implement WebSub challenge/notification validation and lease renewal.
- [ ] Implement metadata enrichment, playlist insertion, quota budgets, and retries.
- [ ] Implement deferred-video and missed-notification reconciliation.
- [ ] Decide whether AI is needed after rule-based selection is evaluated.
- [ ] Obtain authorization for Google configuration, real consent, resource
  provisioning, deployment, and a bounded real-account acceptance test.

Passing scaffold tests is not evidence that these features work.
