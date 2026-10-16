FROM oven/bun:1.3.14 AS bun-runtime
FROM mcr.microsoft.com/playwright:v1.64.1-noble

COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY requirements-agent.txt ./
RUN python3 -m venv /opt/agent \
    && /opt/agent/bin/pip install --no-cache-dir -r requirements-agent.txt
COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    ANTIGRAVITY_PYTHON=/opt/agent/bin/python \
    GEMINI_MODEL=gemini-4-argon \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 8080
CMD ["bun", "src/server.ts"]
