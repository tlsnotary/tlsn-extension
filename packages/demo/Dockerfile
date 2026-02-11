# Build stage for demo
# Context: packages/
FROM node:20-alpine AS demo-builder

# Accept build arguments with defaults
ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_SSL=false
ARG GIT_HASH=local

WORKDIR /app

# Copy demo package files and install dependencies
COPY demo/package.json ./
RUN npm install

# Copy demo source files
COPY demo/ .

# Build with environment variables
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

# Copy tutorial package files and install dependencies
COPY tutorial/package.json ./
RUN npm install

# Copy tutorial source files
COPY tutorial/ .

# Copy built twitter plugin from demo stage (has correct verifier URLs)
COPY --from=demo-builder /app/public/plugins/twitter.js /demo/public/plugins/twitter.js

# Build tutorial with /tutorial/ base path and verifier config
ENV VITE_BASE_PATH=/tutorial/
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_SSL=${VITE_SSL}
ENV GIT_HASH=${GIT_HASH}
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy demo build output
COPY --from=demo-builder /app/dist /usr/share/nginx/html

# Copy tutorial build output
COPY --from=tutorial-builder /app/dist /usr/share/nginx/html/tutorial/
