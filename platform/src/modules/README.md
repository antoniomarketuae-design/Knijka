# Module Boundaries

Rules (docs/architecture/05):

1. Each module exposes its public API **only** through its `index.ts`. Importing another module's internals is a review-blocking violation.
2. Business logic lives in modules, not in React components or route handlers — those are thin adapters.
3. `sim` never touches the DB directly; it reports through `learning`/`analytics` APIs.
4. `tutor` never free-recalls law: retrieval over `/content` + citation only (ADR-002).

Modules: `auth` · `learning` · `exam` · `tutor` · `gamification` · `analytics` · `payments` · `sim`
