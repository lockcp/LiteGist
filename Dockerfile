FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data/shares-text data/gists

EXPOSE 3382

CMD ["node", "server.js"]
