# Build stage
# Build context: the `servers/` Cargo workspace root.
FROM rust:latest AS builder

WORKDIR /app

# Copy workspace manifests + all member manifests so cargo can resolve the workspace
COPY Cargo.toml Cargo.lock ./
COPY verifier/Cargo.toml ./verifier/
COPY swissbank/Cargo.toml ./swissbank/

# Create dummy sources for all workspace members so deps can be fetched
RUN mkdir -p verifier/src swissbank/src && \
    echo "fn main() {}" > verifier/src/main.rs && \
    echo "fn main() {}" > swissbank/src/main.rs

# Fetch dependencies (cached if manifests/lockfile unchanged)
RUN cargo fetch --locked

# Copy real source for this crate
COPY swissbank/src ./swissbank/src

# Invalidate the dummy build
RUN touch swissbank/src/main.rs

# Build release binary
RUN cargo build --release --bin swissbank

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

COPY --from=builder /app/target/release/swissbank /app/swissbank

EXPOSE 3000

CMD ["/app/swissbank"]
