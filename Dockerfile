FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy pnpm workspace config and lockfile first so the catalog is available
# before pnpm attempts to resolve dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy the rest of the monorepo
COPY . .

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
