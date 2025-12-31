# Contributing to Tab Group Syncer

Thanks for your interest in contributing! This project welcomes issues and pull requests.

## Getting Started

- Requirements: Node.js 18+ (CI also tests on Node 20)
- Install dependencies: `npm ci`
- Run tests: `npm test`
- Build extension package: `npm run build` (outputs `tab-group-sync.zip`)

## Development Workflow

1. Fork the repository and create a feature branch from `main`.
2. Make your changes with clear, focused commits.
3. Ensure `npm test` passes locally.
4. Open a Pull Request with a clear description, rationale, and screenshots if UI changes.

## Coding Guidelines

- Keep permissions minimal; avoid adding new permissions without justification.
- Follow the existing code style and patterns in the repo.
- Add or update tests when changing behavior.
- Keep user‑facing strings consistent (e.g., button labels mentioned in README and UI).

## Commit Messages

- Use concise messages. Conventional commits are appreciated (e.g., `fix: ...`, `feat: ...`, `chore: ...`, `test: ...`).

## Release Process

Releases are automated via GitHub Actions. Maintainers will use the workflow to bump versions and create ZIP artifacts.

## Questions?

Please open a discussion or an issue if you’re unsure about an approach before spending significant time.
