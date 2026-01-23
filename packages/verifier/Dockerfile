# Build stage
FROM rust:latest AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest files first for better caching
COPY Cargo.toml Cargo.lock ./

# Create dummy src to fetch dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Fetch dependencies (this layer is cached if Cargo.toml/Cargo.lock don't change)
# Use --locked to respect the lockfile exactly
RUN cargo fetch --locked

# Now copy real source code
COPY src ./src

# Touch main.rs to invalidate the dummy build
RUN touch src/main.rs

# Build release binary
RUN cargo build --release --bin tlsn-verifier-server

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Accept build argument for git hash and set as environment variable
ARG GIT_HASH=local
ENV GIT_HASH=${GIT_HASH}

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/tlsn-verifier-server /app/tlsn-verifier-server

# Copy config if exists
COPY config.yaml /app/config.yaml

EXPOSE 7047

CMD ["/app/tlsn-verifier-server"]
