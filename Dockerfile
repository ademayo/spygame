FROM node:22-alpine

WORKDIR /home/node/app

COPY package*.json ./

RUN npm install

COPY . .

RUN chown -R node:node /home/node/app

USER node

EXPOSE 3000

CMD ["node", "app.js"]
