# Conversor Word→PDF de ESTUDIOOS — imagen mínima para el free tier de Render
# (512 MB). Solo LibreOffice Writer sin GUI + fuentes métricamente compatibles
# con las de Microsoft (Liberation ≈ Times New Roman/Arial, Carlito ≈ Calibri,
# Caladea ≈ Cambria) + un servidor HTTP de Node sin dependencias.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui \
      fonts-liberation \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js .

# Render inyecta PORT (default 10000); el server lo lee del entorno.
EXPOSE 10000
CMD ["node", "server.js"]
