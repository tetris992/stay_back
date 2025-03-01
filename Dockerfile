# 1) Node.js 20(slim) 이미지
FROM node:20-slim

# 2) Puppeteer/Chrome 의존 패키지 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates fonts-liberation libasound2 libnss3 \
    libxss1 libx11-6 libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

# 2-1) 아키텍처별 Chrome/Chromium 설치
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
      echo "Installing chromium instead for arm64..." \
      && apt-get update \
      && apt-get install -y --no-install-recommends chromium \
      ;; \
    *) \
      echo "Unknown architecture; skipping Chrome install" \
      ;; \
    esac \
    && rm -rf /var/lib/apt/lists/*

# 3) 작업 디렉토리 설정
WORKDIR /app

# 4) package.json, package-lock.json 복사 후 npm install
COPY package.json package-lock.json* ./
RUN npm install

# 5) 소스 코드 + .env 복사
COPY . .

# 6) 기본 ENV 설정 (개발 모드에서는 3004)
ENV NODE_ENV=development
ENV PORT=3004

# 7) 포트 노출
EXPOSE 3003
EXPOSE 3004

# 8) CMD: NODE_ENV에 따라 실행 명령 조정
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"development\" ]; then npm run dev; else npm start; fi"]