# Agent Rules

This file defines default working rules for AI agents in this repository.
Keep this file short, practical, and updated as the project evolves.

## Purpose

- Prefer clarity and reliability over clever abstractions.

## Core Constraints

- Total project source code size under 1k LOC

## Coding Defaults

- You aggressively apply DRY principles and guard all code from repetitions
- You write clean, simple Typescript. You don't overengineer.
- You unit test the code you write. You use dependency injection where necessary.
- Unit tests must be colocated with code and named `*.spec.ts`.
- Keep functions small and explicit; avoid hidden side effects.
- Add short comments only where logic is non-obvious.

## Change Workflow

- Make focused, minimal diffs.
- Do not revert unrelated user changes.
- For DB schema changes: implement schema/code updates, then ask user to run migrations manually.
- For new env vars: update `.env.example` with clear comments and add validation in env schema code.

## Documentation

- Update this file when a rule becomes a recurring expectation.
- Keep deeper implementation details in dedicated docs and link from here.
