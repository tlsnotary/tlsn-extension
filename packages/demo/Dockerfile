# Build stage
FROM rust:latest AS builder

WORKDIR /app
COPY index.html *.ico *.js *.sh /app/
RUN ./generate.sh

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/generated /usr/share/nginx/html
