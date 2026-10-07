#!/bin/sh
# CTF-RPG — Copyright (c) 2026 Jaime C Acosta
set -eu
ssl_dir=${SSL_DIR:-/etc/nginx/ssl}
mkdir -p "$ssl_dir"
cert="$ssl_dir/fullchain.pem"
key="$ssl_dir/privkey.pem"
if [ -s "$cert" ] && [ -s "$key" ]; then
    echo 'CTF-RPG: using existing TLS certificate and key.'
    exit 0
fi
if [ -e "$cert" ] || [ -e "$key" ]; then
    echo 'CTF-RPG: incomplete TLS files. Provide both fullchain.pem and privkey.pem, or remove both to generate a self-signed pair.' >&2
    exit 1
fi
origin=${PUBLIC_ORIGIN:-https://localhost}
case "$origin" in https://*) ;; *) echo 'PUBLIC_ORIGIN must start with https:// for the HTTPS proxy.' >&2; exit 1;; esac
authority=${origin#https://}
case "$authority" in
    \[*\]*) hostname=${authority#\[}; hostname=${hostname%%\]*} ;;
    *) hostname=${authority%%:*} ;;
esac
hostname=${TLS_SERVER_NAME:-$hostname}
if ! printf '%s' "$hostname" | grep -Eq '^[a-zA-Z0-9.:-]+$'; then
    echo 'CTF-RPG: invalid TLS_SERVER_NAME.' >&2
    exit 1
fi
case "$hostname" in
    *:*) san="IP:$hostname" ;;
    *) if printf '%s' "$hostname" | grep -Eq '^[0-9.]+$'; then san="IP:$hostname"; else san="DNS:$hostname"; fi ;;
esac
umask 077
task_cert_dir=$(mktemp -d "$ssl_dir/.ctf-rpg-cert.XXXXXX")
trap 'rm -rf "$task_cert_dir"' EXIT HUP INT TERM
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
    -keyout "$task_cert_dir/privkey.pem" -out "$task_cert_dir/fullchain.pem" \
    -subj "/CN=$hostname" -addext "subjectAltName=$san,DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
chmod 600 "$task_cert_dir/privkey.pem"
chmod 644 "$task_cert_dir/fullchain.pem"
mv "$task_cert_dir/privkey.pem" "$key"
mv "$task_cert_dir/fullchain.pem" "$cert"
echo "CTF-RPG: created a self-signed TLS certificate for $hostname."
