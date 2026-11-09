FROM node:20-alpine AS base

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy application source
COPY . .

# Build TypeScript
RUN npm run build || true

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=development

CMD ["npx", "tsx", "src/index.ts"]

