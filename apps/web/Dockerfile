FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
ENV NEXT_DIST_DIR=.next-docker
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "apps/web"]

FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm ci --include=dev
COPY . .
RUN npm run build -w apps/web

FROM base AS production-dependencies
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=@deploywatch/web --include-workspace-root=false

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/web/package.json ./apps/web/package.json
COPY --from=production-dependencies /app/apps/api/package.json ./apps/api/package.json
COPY package.json package-lock.json ./
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/.next ./apps/web/.next
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.js ./apps/web/next.config.js
USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]
