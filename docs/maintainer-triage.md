# Maintainer Triage Guide

This guide keeps issue and pull-request decisions consistent while OrbitOPS accepts external contributions.

## 1. Confirm the problem

Before accepting implementation work:

1. reproduce or verify the reported behavior;
2. search for duplicate issues and pull requests;
3. identify the active production code path;
4. check whether the proposal conflicts with the roadmap or an in-progress change;
5. reduce the request to the smallest testable scope.

A file that appears unused should not be removed until imports, runtime wiring, tests, documentation, and deployment behavior have been checked.

## 2. Record a clear decision

Use one of these outcomes in the issue discussion:

- **Accepted:** the problem and scope are approved for implementation.
- **Needs design:** the problem is valid, but the implementation requires discussion.
- **Future roadmap:** useful work, but not ready for implementation now.
- **Not planned:** duplicate, unsupported, unsafe, or outside project scope.

Explain the reason so future contributors do not repeat the same work.

## 3. Assign implementation deliberately

Only invite or assign a contributor after acceptance criteria are clear. Confirm:

- the files or subsystem involved;
- required tests and documentation;
- compatibility expectations;
- whether the work depends on another issue or pull request.

Contributors should not treat an open issue alone as implementation approval.

## 4. Review pull requests against the issue

A review should verify:

- the pull request solves the accepted problem rather than a broader rewrite;
- the implementation follows existing project patterns;
- tests cover meaningful success and failure behavior;
- the diff contains no unrelated formatting or generated-file noise;
- backend tests, frontend lint, and the production build pass when applicable;
- documentation and changelog entries match user-visible changes.

## 5. Close the loop

When merging, link the issue and summarize the final behavior. When declining, state whether the issue remains open for a different implementation, moves to the future roadmap, or is closed as not planned.
