ARG NEXT_PUBLIC_API_URL=http://localhost:8765

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- builder ----------
FROM node:22-alpine AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runner ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

RUN addgroup -S studio && adduser -S studio -G studio

COPY --from=builder --chown=studio:studio /app/public ./public
COPY --from=builder --chown=studio:studio /app/.next/standalone ./
COPY --from=builder --chown=studio:studio /app/.next/static ./.next/static

USER studio
EXPOSE 3000

CMD ["node", "server.js"]
