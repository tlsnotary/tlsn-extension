# Build stage
FROM node:20-alpine AS builder

# Accept build arguments with defaults
ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_VERIFIER_PROTOCOL=http
ARG VITE_PROXY_PROTOCOL=ws

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source files
COPY . .

# Build with environment variables
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_VERIFIER_PROTOCOL=${VITE_VERIFIER_PROTOCOL}
ENV VITE_PROXY_PROTOCOL=${VITE_PROXY_PROTOCOL}
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
