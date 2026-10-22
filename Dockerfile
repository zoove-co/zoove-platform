# Zoove API production image. Build from the repository root:  docker build -t zoove-api .
# Stage 1 installs everything and compiles TypeScript; stage 2 keeps only what the running API needs.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @zoove/api...
RUN pnpm --filter @zoove/api build
# Production-only copy of the API and its dependencies in /out.
RUN pnpm --filter @zoove/api deploy --prod --legacy /out

FROM node:22-slim AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/services/api/dist ./dist
# Run as the unprivileged "node" user that ships with the image.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
