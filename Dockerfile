FROM node:25-trixie-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --ignore-scripts

COPY ./ ./

RUN npm run build

RUN mv frontend/dist dist/frontend

EXPOSE 8787

CMD ["node", "dist/app.js"]

