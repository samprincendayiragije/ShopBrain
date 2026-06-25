FROM node:22-alpine

# Install pnpm globally and verify version
RUN npm install -g pnpm && pnpm --version

WORKDIR /app

# Copy workspace config files first so the pnpm catalog and lockfile
# are available before any pnpm commands run
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy the entire monorepo
COPY . .

# Approve build scripts so native build deps like esbuild can run during install
RUN pnpm approve-builds --all

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Build the api-server package
RUN pnpm --filter @workspace/api-server build

# Set working directory to the api-server for runtime
WORKDIR /app/artifacts/api-server

# Expose the PORT environment variable (default 3000)
ENV PORT=3000
EXPOSE ${PORT}

CMD ["pnpm", "run", "start"]
