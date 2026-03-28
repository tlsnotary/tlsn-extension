# Build stage
# Context: repo root
FROM node:20-alpine AS builder

ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_SSL=false

WORKDIR /app

# Copy shared tsconfig and tutorial package files
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/tutorial/package.json ./
RUN npm install

COPY packages/tutorial/ .

# Build plugins first (inject env vars)
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_SSL=${VITE_SSL}
RUN node build-plugins.js

# Build React app
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/public/plugins /usr/share/nginx/html/plugins
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
