# Build stage for demo
# Context: repo root
FROM node:20-alpine AS demo-builder

# Accept build arguments with defaults
ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_SSL=false
ARG GIT_HASH=local

WORKDIR /monorepo

# Copy root package files for workspace resolution
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package.json files for workspace packages the demo needs
COPY packages/demo/package.json packages/demo/package.json
COPY packages/plugins/package.json packages/plugins/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/common/package.json packages/common/package.json

# Install dependencies (npm install instead of npm ci — the lockfile references
# all monorepo workspaces but only a subset is present in the Docker context)
RUN npm install --workspace=@tlsnotary/demo --workspace=@tlsn/plugins --workspace=@tlsn/plugin-sdk --workspace=@tlsn/common --include-workspace-root

# Copy source for packages the demo depends on
COPY packages/common/ packages/common/
COPY packages/plugin-sdk/ packages/plugin-sdk/
COPY packages/plugins/ packages/plugins/
COPY packages/demo/ packages/demo/

# Build dependency chain: common → plugin-sdk → plugins → demo
RUN npm run build --workspace=@tlsn/common
RUN npm run build --workspace=@tlsn/plugin-sdk
RUN npm run build --workspace=@tlsn/plugins

WORKDIR /monorepo/packages/demo
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_SSL=${VITE_SSL}
ENV GIT_HASH=${GIT_HASH}
RUN npm run build

# Build stage for tutorial
FROM node:20-alpine AS tutorial-builder

ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_SSL=false
ARG GIT_HASH=local

WORKDIR /app

# Copy shared tsconfig and tutorial package files
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/tutorial/package.json ./
RUN npm install

# Copy tutorial source files
COPY packages/tutorial/ .

# Copy built twitter plugin from demo stage (has correct verifier URLs)
COPY --from=demo-builder /monorepo/packages/demo/public/plugins/twitter.js /demo/public/plugins/twitter.js

# Build tutorial with /tutorial/ base path and verifier config
ENV VITE_BASE_PATH=/tutorial/
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_SSL=${VITE_SSL}
ENV GIT_HASH=${GIT_HASH}
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy demo build output
COPY --from=demo-builder /monorepo/packages/demo/dist /usr/share/nginx/html

# Copy tutorial build output
COPY --from=tutorial-builder /app/dist /usr/share/nginx/html/tutorial/
