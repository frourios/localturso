FROM node:26-alpine3.23 AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM node:26-alpine3.23
WORKDIR /usr/src/app
ENV NODE_ENV=production PORT=5050 LOCALTURSO_DATA_DIR=/usr/src/app/data
COPY --from=builder /usr/src/app/package.json /usr/src/app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/drizzle ./drizzle
COPY --from=builder /usr/src/app/batches/start.mjs ./batches/start.mjs
RUN mkdir data && chown node:node data
USER node
EXPOSE 5050
VOLUME ["/usr/src/app/data"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/publicApi/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
