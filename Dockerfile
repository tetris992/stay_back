FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates fonts-liberation libasound2 libnss3 \
    libxss1 libx11-6 libx11-xcb1

# 1) architecture 확인
RUN case "$(dpkg --print-architecture)" in \
    "amd64") \
      echo "Installing google-chrome-stable for amd64..." \
      && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
      && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
         > /etc/apt/sources.list.d/google-chrome.list \
      && apt-get update \
      && apt-get install -y --no-install-recommends google-chrome-stable \
      ;; \
    "arm64") \
      echo "Installing chromium instead of google-chrome-stable for arm64..." \
      && apt-get update \
      && apt-get install -y --no-install-recommends chromium \
      ;; \
    *) \
      echo "Unknown architecture; skipping Chrome install" \
      ;; \
    esac \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3003
CMD ["npm", "start"]
