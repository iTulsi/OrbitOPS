# Contributing to OrbitOPS

Thank you for your interest in contributing to OrbitOPS.

OrbitOPS is a real-time satellite and orbital-debris intelligence platform built with Python, Flask, SGP4, React, Vite, and Three.js.

Contributions involving code, testing, documentation, accessibility, UI improvements, bug fixes, and deployment are welcome.

## Ways to Contribute

You can contribute by:

* Fixing confirmed bugs
* Adding or improving backend tests
* Improving frontend accessibility and responsiveness
* Improving API validation and error handling
* Improving orbital-data processing
* Improving documentation
* Improving deployment and observability
* Reporting reproducible issues

Before starting a large feature or architectural change, open an issue first.

## Prerequisites

Install the following tools:

* Git
* Python 3.12 or later
* Node.js 20
* npm

Verify the installation:

```bash
git --version
python3 --version
node --version
npm --version
```

## Local Development Setup

### 1. Fork and clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/OrbitOPS.git
cd OrbitOPS
```

Add the original repository as the upstream remote:

```bash
git remote add upstream https://github.com/iTulsi/OrbitOPS.git
git remote -v
```

### 2. Set up the backend

From the repository root:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements-dev.txt
```

### 3. Configure environment variables

Create the local environment file:

```bash
cp backend/.env.example backend/.env
```

Never commit API keys, access tokens, passwords, or production secrets.

### 4. Install frontend dependencies

```bash
cd frontend
npm ci
cd ..
```

## Running OrbitOPS

### Start the backend

From the repository root:

```bash
source backend/.venv/bin/activate
python backend/app.py
```

The backend normally runs at:

```text
http://localhost:5050
```

Verify the health endpoint:

```bash
curl http://localhost:5050/api/health
```

### Start the frontend

Open another Terminal window:

```bash
cd frontend
npm run dev
```

The frontend normally runs at:

```text
http://localhost:5173
```

Keep both services running when testing full-stack changes.

## Testing and Validation

Run the checks relevant to your changes before opening a pull request.

### Backend tests

```bash
backend/.venv/bin/python -m pytest backend/tests -q
```

### Python syntax validation

```bash
python -m compileall -q backend
```

### Frontend linting

```bash
cd frontend
npm run lint
```

### Frontend production build

```bash
cd frontend
npm run build
```

### Patch validation

From the repository root:

```bash
git status
git diff
git diff --check
```

`git diff --check` should finish without errors.

## Branch Naming

Use one focused branch for each change.

```text
feature/short-description
fix/short-description
docs/short-description
test/short-description
refactor/short-description
chore/short-description
```

Examples:

```text
docs/add-contributing-guide
fix/handle-empty-orbital-response
test/add-health-endpoint-coverage
feature/add-object-filtering
```

## Commit Messages

Use concise commit messages that explain the purpose of the change.

Recommended prefixes:

```text
Feat:
Fix:
Docs:
Test:
Refactor:
Chore:
Ops:
```

Examples:

```text
Docs: Add contributor and local development guide
Fix: Handle unavailable orbital data safely
Test: Add API health endpoint coverage
```

Avoid unclear messages such as:

```text
update
changes
final fix
working
```

## Pull Request Process

1. Search existing issues before beginning work.
2. Create a focused branch from the latest `main`.
3. Make only the changes required for that issue.
4. Add or update tests where applicable.
5. Run the relevant validation checks.
6. Review your changes using `git diff`.
7. Push the branch and open a pull request.
8. Link the related issue.
9. Respond to review feedback before merging.

A pull request should contain:

* A clear summary
* The problem being solved
* The implementation approach
* Testing performed
* Screenshots for visual changes
* Known limitations or follow-up work
* A link to the related issue

Use a closing keyword when the pull request completely resolves an issue:

```text
Fixes #1
```

## Pull Request Checklist

Before requesting review, confirm:

* [ ] The change addresses one clear issue
* [ ] The branch is based on the latest `main`
* [ ] No secrets or credentials are included
* [ ] Backend tests pass when applicable
* [ ] Frontend lint passes when applicable
* [ ] Frontend production build passes when applicable
* [ ] `git diff --check` reports no errors
* [ ] Documentation is updated where required
* [ ] Screenshots are included for visual changes
* [ ] The related issue is linked

## Code Quality

### Python

* Use readable and consistent names
* Keep functions focused
* Add type hints where they improve clarity
* Handle network and parsing failures safely
* Avoid broad exception handling without logging
* Add tests for changed behaviour

### React and JavaScript

* Prefer reusable components
* Preserve keyboard navigation
* Include accessible labels
* Handle loading, empty, and error states
* Avoid hard-coded production URLs

### Orbital and Risk Data

Changes involving orbital data should:

* Preserve source provenance
* Avoid presenting synthetic data as live telemetry
* Distinguish heuristic scores from collision probabilities
* Handle unavailable upstream data safely
* Avoid unsupported operational claims

## Reporting Bugs

A useful bug report should include:

* A clear summary
* Steps to reproduce
* Expected behaviour
* Actual behaviour
* Operating system
* Python and Node.js versions
* Browser information
* Relevant logs or screenshots

Remove all secrets before sharing logs.

## Feature Requests

Feature requests should explain:

* The problem being solved
* Who benefits from the change
* The proposed behaviour
* Possible alternatives
* UI or API implications
* Testing requirements

Thank you for helping improve OrbitOPS.
