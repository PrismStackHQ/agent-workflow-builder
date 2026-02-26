FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs/ ./libs/
COPY services/onboarding-service/package.json ./services/onboarding-service/
RUN npm ci --workspace=@agent-workflow/shared-types --workspace=@agent-workflow/nats-client --workspace=@agent-workflow/prisma-client --workspace=@agent-workflow/onboarding-service 2>/dev/null || npm install

FROM base AS build
COPY services/onboarding-service/ ./services/onboarding-service/
COPY tsconfig.base.json ./
RUN cd libs/prisma-client && npx prisma generate
RUN cd services/onboarding-service && npx tsc --outDir dist

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/onboarding-service/dist ./dist
COPY --from=build /app/libs/prisma-client/prisma ./prisma
RUN mkdir -p node_modules/@agent-workflow && \
    for lib in shared-types nats-client prisma-client auth observability; do \
      rm -rf node_modules/@agent-workflow/$lib && \
      ln -sf /app/dist/libs/$lib/src node_modules/@agent-workflow/$lib; \
    done
EXPOSE 3010
CMD ["node", "dist/services/onboarding-service/src/main.js"]
