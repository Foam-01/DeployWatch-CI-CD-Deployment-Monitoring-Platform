FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
EXPOSE 4000
CMD ["npm", "run", "start:dev", "-w", "apps/api"]

FROM development AS migrate
CMD ["npm", "run", "db:migrate:prod", "-w", "apps/api"]

FROM base AS builder
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build -w apps/api

FROM base AS production-dependencies
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=@deploywatch/api --include-workspace-root=false

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api/package.json ./apps/api/package.json
COPY package.json package-lock.json ./
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 4000
CMD ["npm", "run", "start:prod", "-w", "apps/api"]
