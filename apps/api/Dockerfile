# Multi-stage Dockerfile for DeployWatch NestJS API

# Stage 1: Base
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
COPY prisma ./prisma/

# Stage 2: Development (used by docker-compose.yml)
FROM base AS development
ENV NODE_ENV=development
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# Stage 3: Builder
FROM base AS builder
ENV NODE_ENV=production
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 4: Production Runner
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["npm", "run", "start:prod"]
