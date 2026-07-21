FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime: nginx to serve static files ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback + API proxy — all routes serve index.html, /api goes to backend
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location /api { \
  proxy_pass http://cbe-server:3000; \
  proxy_set_header Host $host; \
  proxy_set_header X-Real-IP $remote_addr; \
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
  proxy_set_header X-Forwarded-Proto $scheme; \
  } \
  location /ws { \
  proxy_pass http://cbe-server:3000; \
  proxy_http_version 1.1; \
  proxy_set_header Upgrade $http_upgrade; \
  proxy_set_header Connection "upgrade"; \
  proxy_set_header Host $host; \
  } \
  location / { \
  try_files $uri $uri/ /index.html; \
  } \
  }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
