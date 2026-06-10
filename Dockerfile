FROM node:20-alpine AS builder

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci

# Install and build frontend
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend/ ./frontend/
RUN npm run --prefix frontend build

# Compile TypeScript backend
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled backend and built frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Copy policies and service registry
COPY policies/ ./policies/
COPY services.yaml ./

# SQLite database lives on a mounted volume at /app/data
ENV DB_PATH=/app/data/control-plane.db
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

EXPOSE 3002

CMD ["node", "dist/index.js"]
