FROM node:22-alpine

# Enable corepack so it installs the exact pnpm version pinned in
# package.json's "packageManager" field -- no version drift between
# local dev, CI, and Railway builds. (Just "enable" here -- "prepare"
# needs package.json to already be present, which happens below.)
RUN corepack enable

WORKDIR /app

# Copy workspace config files first so the pnpm catalog and lockfile
# are available before any pnpm commands run
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy the entire monorepo
COPY . .

# Install all workspace dependencies. Because pnpm is pinned via
# packageManager + corepack, this now matches the onlyBuiltDependencies
# schema in pnpm-workspace.yaml and esbuild's build script is approved
# automatically -- no interactive approve-builds fallback needed.
RUN pnpm -w install --no-frozen-lockfile --prod=false

# Build the api-server package (workspace-aware)
RUN pnpm -w -F @workspace/api-server run build

# Set working directory to the api-server for runtime
WORKDIR /app/artifacts/api-server

# Expose the PORT environment variable (default 3000)
ENV PORT=3000
EXPOSE ${PORT}

# Start the api-server package from the workspace
CMD ["pnpm", "-w", "-F", "@workspace/api-server", "run", "start"]
