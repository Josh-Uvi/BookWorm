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
ENV VITE_WS_URL=$VITE_WS_URL VITE_MEDIA_URL=$VITE_MEDIA_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
