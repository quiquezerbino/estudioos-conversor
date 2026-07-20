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

# Fuentes core de Microsoft REALES (Times New Roman, Arial, etc.): los .docx de
# escribanos usan Times New Roman y la gemela libre (Liberation) corta los
# renglones distinto. El instalador de Debian (contrib) las baja del canal
# oficial de Microsoft bajo su EULA gratuita de redistribución.
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get install -y --no-install-recommends ttf-mscorefonts-installer fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js .

# Render inyecta PORT (default 10000); el server lo lee del entorno.
EXPOSE 10000
CMD ["node", "server.js"]
