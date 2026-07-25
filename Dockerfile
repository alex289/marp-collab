FROM node:26-trixie AS builder

COPY --from=ghcr.io/pnpm/pnpm:11.5.2 /opt/pnpm /opt/pnpm
RUN ln -s /opt/pnpm/pnpm /usr/local/bin/pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY e2e/package.json ./e2e/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm i --frozen-lockfile --store-dir /pnpm/store

COPY . .
RUN cd backend && node --run build && cd ../frontend && node --run build

FROM node:26-trixie-slim

USER node
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/dist/ ./

RUN echo '{ "type": "module" }' > package.json

EXPOSE 8787

CMD ["node", "./bin/app.js"]
