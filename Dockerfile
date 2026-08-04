# syntax=docker/dockerfile:1.4
#
# Standalone frontend image — builds the Angular app and serves the static
# output with nginx. No longer depends on job-hunter-api's Docker build.

# ---- Stage 1: build the Angular app ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: serve with nginx ----
FROM nginx:alpine
COPY --from=build /app/dist/job-hunter-site/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
