FROM node:24-bookworm-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm-256color \
    COLORTERM=truecolor

ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        fd-find \
        git \
        gzip \
        gh \
        ncurses-term \
        openssh-client \
        python3 \
        python3-pip \
        ripgrep \
        tmux \
        unzip \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    architecture="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$architecture" in \
        amd64) nvim_arch=x86_64; lazygit_arch=x86_64 ;; \
        arm64) nvim_arch=arm64; lazygit_arch=arm64 ;; \
        *) echo "Unsupported architecture: $architecture" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/nvim.tar.gz \
        "https://github.com/neovim/neovim/releases/latest/download/nvim-linux-${nvim_arch}.tar.gz"; \
    mkdir -p /opt/nvim; \
    tar -xzf /tmp/nvim.tar.gz -C /opt/nvim --strip-components=1; \
    ln -s /opt/nvim/bin/nvim /usr/local/bin/nvim; \
    release_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
        https://github.com/jesseduffield/lazygit/releases/latest)"; \
    lazygit_version="${release_url##*/v}"; \
    curl -fsSL -o /tmp/lazygit.tar.gz \
        "https://github.com/jesseduffield/lazygit/releases/download/v${lazygit_version}/lazygit_${lazygit_version}_Linux_${lazygit_arch}.tar.gz"; \
    tar -xzf /tmp/lazygit.tar.gz -C /usr/local/bin lazygit; \
    chmod 0755 /usr/local/bin/lazygit; \
    rm /tmp/nvim.tar.gz /tmp/lazygit.tar.gz

# Newer CLI binaries require a newer glibc than Debian Bookworm provides.
RUN npm install --global tree-sitter-cli@0.25.10 \
    && npm install --global --ignore-scripts \
        @earendil-works/pi-coding-agent@0.84.3 \
    && npm install --global opencode-ai@1.18.25

RUN python3 -m pip install \
    --no-cache-dir \
    --break-system-packages \
    graphifyy

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY agent_profiles/pimatt/pimatt /usr/local/bin/pimatt
COPY agent_profiles/pibrain/pibrain /usr/local/bin/pibrain
COPY agent_profiles/code/code /usr/local/bin/code
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/pimatt /usr/local/bin/pibrain /usr/local/bin/code

WORKDIR /pi_agent/workspaces

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["sleep", "infinity"]
