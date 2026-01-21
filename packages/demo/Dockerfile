# Build stage
FROM node:20-alpine AS builder

# Accept build arguments with defaults
ARG VITE_VERIFIER_HOST=localhost:7047
ARG VITE_SSL=false
ARG GIT_HASH=local

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy source files
COPY . .

# Build with environment variables
ENV VITE_VERIFIER_HOST=${VITE_VERIFIER_HOST}
ENV VITE_SSL=${VITE_SSL}
ENV GIT_HASH=${GIT_HASH}
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
