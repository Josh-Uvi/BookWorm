# AI Reading Assistant — client build & serve
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Injected at build time; empty values fall back to the same-origin
# defaults baked into the app (see src/hooks/useReadingAssistant.ts).
ARG VITE_WS_URL=""
ARG VITE_MEDIA_URL="/media"
ARG VITE_API_URL="/api"
ENV VITE_WS_URL=$VITE_WS_URL VITE_MEDIA_URL=$VITE_MEDIA_URL VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx *template*: the entrypoint renders it with envsubst at startup
# (SERVER_WS_UPSTREAM / SERVER_MEDIA_UPSTREAM → /etc/nginx/conf.d/default.conf).
COPY nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
