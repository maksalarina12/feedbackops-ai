SHELL := /bin/bash

.PHONY: help demo seed validate eval test test-api build logs review-hash

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

demo: ## Build and start the Docker Compose stack
	docker compose up -d --build

logs: ## Follow container logs
	docker compose logs -f --tail=100

seed: ## Seed the review queue (reads .env when present)
	set -a; [ -f .env ] && . ./.env; set +a; python3 scripts/seed_demo.py

validate: ## Run offline repository, routing, audit, and policy checks
	python3 scripts/validate_repo.py
	node scripts/test_routing.mjs
	node scripts/test_audit_store.mjs

eval: ## Evaluate the exported routing policy against golden cases
	node scripts/evaluate_policy.mjs

test: validate eval ## Run every offline test

test-api: ## Build and run live API integration tests
	cd frontend && npm run build && node ../scripts/test_api.mjs

build: ## Clean-install and build the frontend
	cd frontend && npm ci && npm run build

review-hash: ## Hash a reviewer password read from stdin
	@node scripts/hash_review_password.mjs
