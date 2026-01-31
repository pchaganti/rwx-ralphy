# Contributing to Ralphy

## Code Change Philosophy

### Keep Changes Small and Focused

- **One logical change per commit** - Each commit should do exactly one thing
- If a task feels too large, break it into subtasks
- Prefer multiple small commits over one large commit
- Run feedback loops after each change, not at the end

**Quality over speed. Small steps compound into big progress.**

### Task Prioritization

When working on tasks, prioritize in this order:

1. **Architectural decisions and core abstractions** - Get the foundation right first
2. **Integration points between modules** - Ensure components connect properly
3. **Unknown unknowns and spike work** - De-risk early with exploratory work
4. **Standard features and implementation** - Build on solid foundations
5. **Polish, cleanup, and quick wins** - Save easy wins for later

**Fail fast on risky work. Save easy wins for later.**

## Code Quality Standards

### Write Concise Code

After writing any code, ask yourself:

> "Would a senior engineer say this is overcomplicated?"

If yes, **simplify**.

### Avoid Over-Engineering

- Only make changes that are directly requested or clearly necessary
- Don't add features, refactor code, or make "improvements" beyond what was asked
- A bug fix doesn't need surrounding code cleaned up
- A simple feature doesn't need extra configurability
- Don't add comments or type annotations to unchanged code
- Only add comments where the logic isn't self-evident

### Clean Code Practices

- Don't fill files just for the sake of it
- **Don't leave dead code** - if it's unused, delete it completely
- No backwards-compatibility hacks like renaming unused `_vars`
- No re-exporting types for removed code
- No `// removed` comments for deleted code
- Be organized, concise, and clean

## Technical Debt Warning

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

**Fight entropy. Leave the codebase better than you found it.**

## Development Setup

```bash
# Clone the repository
git clone https://github.com/michaelshimeles/ralphy.git
cd ralphy/cli

# Install dependencies
bun install

# Run linting
bun run check

# Run tests
bun test

# Build
bun run build
```

## Tech Stack

- **Runtime**: Bun (Node.js 18+ fallback)
- **Language**: TypeScript (strict mode)
- **Linting/Formatting**: Biome
- **CLI Framework**: Commander

## Code Style

Code style is enforced by Biome. Run `bun run check` before committing.

- **Indentation**: Tabs
- **Line width**: 100 characters
- **Line endings**: LF
- **Imports**: Auto-organized by Biome

## Commit Guidelines

1. One logical change per commit
2. Write descriptive commit messages
3. Format: `type: brief description`

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructuring (no behavior change)
- `docs:` Documentation
- `test:` Test additions/changes
- `chore:` Maintenance tasks

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the guidelines above
3. Ensure all tests pass: `bun test`
4. Ensure linting passes: `bun run check`
5. Submit a PR with a clear description of changes

## Directory Structure

```
cli/
├── src/
│   ├── cli/           # CLI argument parsing and commands
│   ├── config/        # Configuration management
│   ├── engines/       # AI engine integrations (Claude, Cursor, etc.)
│   ├── execution/     # Task execution orchestration
│   ├── git/           # Git operations (branches, PRs, worktrees)
│   ├── tasks/         # Task source handlers (Markdown, YAML, JSON)
│   ├── notifications/ # Webhook notifications
│   ├── telemetry/     # Usage analytics
│   └── ui/            # User interface/logging
```

## Questions?

Join our [Discord](https://discord.gg/SZZV74mCuV) for questions and discussions.
