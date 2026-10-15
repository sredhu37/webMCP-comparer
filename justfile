# List the recipes
default:
    @just --list

# Install dependencies and the Playwright Chromium build
install:
    npm ci
    npx playwright install chromium

# App on :3000 and demo shop on :4000, with live reload
dev:
    npm run dev

# Production build, then app on :3000 and demo shop on :4000
start:
    npm start

# Demo shop only, on :4000
demo:
    npm run demo

# Lint, typecheck and test
check:
    npm run lint
    npm run typecheck
    npm test

# Compare the bundled price table with the official pricing pages
prices-check:
    npm run prices:check
