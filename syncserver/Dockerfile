# syntax=docker/dockerfile:1.7

##
# Builder image: compile syncserver in release mode
##
FROM rust:1.83-bullseye AS builder

WORKDIR /app

# Install minimal build dependencies (OpenSSL for TLS-enabled crates).
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Cache dependencies first.
COPY Cargo.toml Cargo.lock ./
COPY .cargo .cargo
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Copy full source and rebuild.
COPY . .
RUN cargo build --release

##
# Runtime image: slim Debian with non-root user.
##
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd --system --create-home --uid 10001 syncserver

WORKDIR /app

ENV SYNC_HOST=0.0.0.0 \
    SYNC_PORT=8080 \
    SYNC_CONFIG_PATH=/app/config/config.json

COPY --from=builder /app/target/release/syncserver /app/syncserver
COPY config/config.example.json /app/config/config.json

USER syncserver

EXPOSE 8080

ENTRYPOINT ["/app/syncserver"]
