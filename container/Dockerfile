FROM node:22-slim

WORKDIR /app

COPY container/package.json /app/package.json
COPY container/tsconfig.json /app/tsconfig.json
RUN npm install

COPY container/src /app/src
RUN npm run build
# Copy non-TS assets that live alongside compiled JS
COPY container/src/system-prompt.txt /app/dist/system-prompt.txt

USER node
CMD ["node", "/app/dist/index.js"]
