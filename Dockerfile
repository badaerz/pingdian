# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_DEMO_LOCKED=false
ENV NEXT_PUBLIC_DEMO_LOCKED=$NEXT_PUBLIC_DEMO_LOCKED

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 storyforge

COPY --from=build --chown=storyforge:nodejs /app/.next/standalone ./
COPY --from=build --chown=storyforge:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=storyforge:nodejs /app/public ./public

USER storyforge
EXPOSE 3000
CMD ["node", "server.js"]
