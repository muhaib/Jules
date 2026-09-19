# Built from the repository root:
#   docker build -f apps/dashboard/Dockerfile -t aicg-dashboard .
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/dashboard/package.json apps/dashboard/package-lock.json* ./
RUN npm install
COPY apps/dashboard/ ./
# API_URL is read at request time as well, so this value is only a build-time
# default for the rewrite target.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.js ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
