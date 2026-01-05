# Build stage
FROM node:20-alpine AS builder

# Accept build arguments with defaults
ARG VITE_VERIFIER_URL=http://localhost:7047
ARG VITE_PROXY_URL=ws://localhost:7047/proxy?token=

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source files
COPY . .

# Build with environment variables
ENV VITE_VERIFIER_URL=${VITE_VERIFIER_URL}
ENV VITE_PROXY_URL=${VITE_PROXY_URL}
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
