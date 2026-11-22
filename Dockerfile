# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SURFACE=lawyerlab
ENV VITE_SURFACE=${VITE_SURFACE}
ARG VITE_TURNSTILE_SITEKEY
ENV VITE_TURNSTILE_SITEKEY=${VITE_TURNSTILE_SITEKEY}
RUN test -n "$VITE_TURNSTILE_SITEKEY" && npm run build

FROM nginx:alpine
ARG NGINX_PORT=7200
ENV NGINX_PORT=${NGINX_PORT}
ARG NGINX_GATEWAY_UPSTREAM=http://tool-parse-gateway:8080
ENV NGINX_GATEWAY_UPSTREAM=${NGINX_GATEWAY_UPSTREAM}
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE ${NGINX_PORT}
