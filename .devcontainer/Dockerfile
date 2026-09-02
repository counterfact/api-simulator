FROM node:24.19.0-bookworm-slim

USER root

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        git \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

USER node
