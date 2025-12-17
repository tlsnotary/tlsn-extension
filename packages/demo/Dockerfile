# Build stage
FROM rust:latest AS builder

# Accept build arguments with defaults
ARG VERIFIER_HOST=localhost:7047
ARG SSL=false

WORKDIR /app
COPY index.html *.ico *.js *.sh /app/

# Pass build args as environment variables to generate.sh
RUN VERIFIER_HOST="${VERIFIER_HOST}" SSL="${SSL}" ./generate.sh

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/generated /usr/share/nginx/html
