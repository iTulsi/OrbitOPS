# OrbitOPS engineering principles

OrbitOPS will be improved incrementally through small, testable, reversible
changes. The project favors straightforward implementation with strong system
boundaries over speculative abstractions.

## Understand before changing

Every change must identify:

- the production caller;
- ownership of the affected state;
- the public data contract;
- failure and degraded behavior;
- deployment consequences;
- the tests that protect the behavior.

## One owner per responsibility

OrbitOPS should have:

- one browser-side telemetry owner;
- one shared HTTP transport implementation;
- one conjunction-priority implementation;
- one configuration source;
- one authoritative backend deployment model;
- one canonical vocabulary for risk and screening priority.

## Validate system boundaries

Untrusted and uncertain data must be validated where it enters the system:

- environment variables;
- HTTP requests;
- CelesTrak responses;
- cached files;
- AI-provider responses;
- frontend API responses;
- persisted history.

## Secure defaults

Production must not silently use:

- development secrets;
- wildcard CORS;
- unauthenticated administrative operations;
- unlimited expensive endpoints;
- internal exception details in public responses;
- success responses for partially unavailable dependencies.

## Prefer explicit code

Small functions and direct data flow are preferred over hidden mutation,
monkeypatching, broad global state, and unnecessary framework abstractions.

New factories, interfaces, repositories, event buses, or dependency-injection
layers require a demonstrated architectural need.

## Test behavior

Tests should protect observable behavior, contracts, invariants, failure modes,
degraded operation, and production startup.

Tests should not primarily assert implementation details or extensive mocked
call sequences.

## Measure before optimizing

Performance changes require evidence such as request duration, propagation time,
screening time, response size, cache behavior, or frontend render cost.

## Focused pull requests

Each pull request should:

1. solve one coherent problem;
2. avoid unrelated cleanup;
3. include relevant tests;
4. run lint, builds, and applicable smoke checks;
5. document risk and behavior changes;
6. review the complete diff before commit;
7. remain safe to revert.
