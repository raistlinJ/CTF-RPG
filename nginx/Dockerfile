# CTF-RPG — Copyright (c) 2026 Jaime C Acosta
FROM nginx:stable-alpine
RUN apk add --no-cache openssl
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY 15-ensure-certificates.sh /docker-entrypoint.d/15-ensure-certificates.sh
RUN chmod +x /docker-entrypoint.d/15-ensure-certificates.sh
