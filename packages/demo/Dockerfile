# Build stage - Build React app
FROM node:20-alpine AS react-builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Plugin generation stage
FROM rust:latest AS plugin-builder

# Accept build arguments with defaults
ARG VERIFIER_HOST=localhost:7047
ARG SSL=false

WORKDIR /app
COPY *.js *.sh /app/

# Pass build args as environment variables to generate.sh
RUN VERIFIER_HOST="${VERIFIER_HOST}" SSL="${SSL}" ./generate.sh

# Runtime stage
FROM nginx:alpine

COPY --from=react-builder /app/dist /usr/share/nginx/html
COPY --from=plugin-builder /app/generated/*.js /usr/share/nginx/html/
