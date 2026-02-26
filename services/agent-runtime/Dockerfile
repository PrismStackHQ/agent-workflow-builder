FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs/ ./libs/
COPY services/agent-runtime/package.json ./services/agent-runtime/
RUN npm ci --workspace=@agent-workflow/shared-types --workspace=@agent-workflow/nats-client --workspace=@agent-workflow/prisma-client --workspace=@agent-workflow/agent-runtime 2>/dev/null || npm install

FROM base AS build
COPY services/agent-runtime/ ./services/agent-runtime/
COPY tsconfig.base.json ./
RUN cd libs/prisma-client && npx prisma generate
RUN cd services/agent-runtime && npx tsc --outDir dist

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/agent-runtime/dist ./dist
COPY --from=build /app/libs/prisma-client/prisma ./prisma
RUN mkdir -p node_modules/@agent-workflow && \
    for lib in shared-types nats-client prisma-client auth observability; do \
      rm -rf node_modules/@agent-workflow/$lib && \
      ln -sf /app/dist/libs/$lib/src node_modules/@agent-workflow/$lib; \
    done
EXPOSE 3015
CMD ["node", "dist/services/agent-runtime/src/main.js"]
