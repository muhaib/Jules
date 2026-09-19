# Built from the repository root so the workspace packages resolve:
#   docker build -f apps/api/Dockerfile -t aicg-api .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/middleware/package.json packages/middleware/
COPY apps/api/package.json apps/api/
COPY examples/express-site/package.json examples/express-site/
COPY examples/reverse-proxy/package.json examples/reverse-proxy/
RUN npm ci --omit=dev --workspace @ai-crawler-guard/api --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/core ./packages/core
COPY apps/api ./apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/server.js"]
