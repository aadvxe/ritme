# One image, two roles: ROLE=api (public, also serves the built SPA) or ROLE=worker (private).
# Build from the repo root:  docker build -f infra/Dockerfile -t ritme .

FROM node:22-slim AS web
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/frontend apps/frontend
COPY packages/api-client packages/api-client
COPY packages/design packages/design
RUN pnpm install --frozen-lockfile --filter @ritme/frontend...
RUN pnpm --filter @ritme/frontend build

FROM python:3.12-slim AS app
ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /srv
COPY pyproject.toml uv.lock ./
COPY packages/contracts packages/contracts
COPY packages/ai-engine packages/ai-engine
COPY apps/backend apps/backend
RUN uv sync --frozen --no-dev --package ritme-backend
COPY --from=web /repo/apps/frontend/dist apps/frontend/dist

ENV PATH="/srv/.venv/bin:$PATH" PORT=8080 ROLE=api
WORKDIR /srv/apps/backend
# No credentials are baked in. On Cloud Run the runtime service account supplies ADC.
CMD ["sh", "-c", "if [ \"$ROLE\" = \"worker\" ]; then exec uvicorn app.worker.main:app --host 0.0.0.0 --port ${PORT}; else exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}; fi"]
