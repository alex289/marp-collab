FROM node:26-trixie-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci
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
