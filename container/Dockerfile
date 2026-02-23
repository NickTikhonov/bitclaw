FROM node:22-slim

WORKDIR /app

COPY container/agent-runner/package.json /app/package.json
COPY container/agent-runner/tsconfig.json /app/tsconfig.json
RUN npm install

COPY container/agent-runner/src /app/src
RUN npm run build

USER node
CMD ["node", "/app/dist/index.js"]
