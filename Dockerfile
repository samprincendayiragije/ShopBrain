FROM node:18-alpine

# Install pnpm globally and verify version
RUN npm install -g pnpm && pnpm --version

WORKDIR /app

# Copy workspace config files first so the pnpm catalog and lockfile
# are available before any pnpm commands run
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy the entire monorepo
COPY . .

# Install all workspace dependencies from the workspace root.
# If pnpm blocks build scripts (ERR_PNPM_IGNORED_BUILDS), try to
# auto-approve them and retry the install non-interactively.
RUN pnpm -w install --no-frozen-lockfile || (pnpm approve-builds --all && pnpm -w install --no-frozen-lockfile)

# Explicitly install dependencies for the api-server package
RUN pnpm -w -F @workspace/api-server install

# Build the api-server package (workspace-aware)
RUN pnpm -w -F @workspace/api-server run build

# Set working directory to the api-server for runtime
WORKDIR /app/artifacts/api-server

# Expose the PORT environment variable (default 3000)
ENV PORT=3000
EXPOSE ${PORT}

# Start the api-server package from the workspace
CMD ["pnpm", "-w", "-F", "@workspace/api-server", "run", "start"]
