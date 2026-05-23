FROM ghcr.io/pnpm/pnpm:11.2.1 AS builder
RUN pnpm runtime set node 26 -g

WORKDIR /app
COPY package.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm i --frozen-lockfile --store-dir /pnpm/store && cd backend && pnpm rebuild better-sqlite3

COPY . .
RUN node --run build

FROM node:26-trixie-slim

USER node
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/dist/ ./

RUN echo '{ "type": "module" }' > package.json

EXPOSE 8787

CMD ["node", "./app.js"]
