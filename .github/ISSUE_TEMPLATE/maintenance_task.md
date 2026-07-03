---
name: Maintenance task
about: Propose a scoped refactor, cleanup, test, documentation, or tooling improvement
title: "chore: "
labels: ""
assignees: ""
---

## Problem

Describe the concrete maintenance problem. Explain why the current state creates risk, duplication, confusion, or unnecessary effort.

## Evidence

Provide file paths, references, failing output, screenshots, or a minimal reproduction. Avoid proposing removal or replacement based only on a filename or assumption.

## Proposed scope

State the smallest change that would resolve the problem. List what is intentionally out of scope.

## Acceptance criteria

- [ ] The affected behavior or documentation is identified.
- [ ] Existing users and API contracts remain compatible, or the breaking change is approved.
- [ ] Relevant automated tests are added or updated.
- [ ] Backend tests pass when backend code changes.
- [ ] Frontend lint and production build pass when frontend code changes.
- [ ] Documentation is updated when contributor or runtime behavior changes.

## Contributor note

Please wait for maintainer confirmation before opening a pull request. An issue may be valid while the proposed implementation, timing, or scope still needs discussion.
