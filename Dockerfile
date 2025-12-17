FROM node:18-bullseye as bot

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG RAILWAY_STATIC_URL
ENV PUBLIC_URL=$RAILWAY_STATIC_URL
ENV PORT=3000

CMD ["npm", "start"]