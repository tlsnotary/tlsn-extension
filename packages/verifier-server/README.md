# Verifier Server

A simple TypeScript HTTP server built with Fastify for TLSNotary verification.

## Features

- `/health` endpoint that returns 'ok'
- Built with Fastify for high performance
- TypeScript with full type safety
- Development mode with hot reload using tsx

## Installation

```bash
npm install
```

## Usage

### Development Mode (with hot reload)

```bash
npm run dev
```

The server will start on `http://0.0.0.0:3001` by default.

### Production Build

```bash
npm run build
npm start
```

### Configuration

You can configure the server using environment variables:

- `PORT` - Server port (default: 3001)
- `HOST` - Server host (default: 0.0.0.0)

Example:

```bash
PORT=8080 HOST=localhost npm run dev
```

## Endpoints

### GET /health

Health check endpoint.

**Response:**
```
ok
```

**Status Code:** 200

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
