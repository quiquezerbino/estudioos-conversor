# Conversor Word→PDF de ESTUDIOOS — imagen para el free tier de Render (512 MB).
# LibreOffice 26.2 OFICIAL de The Document Foundation (la de Debian es 7.4, de
# 2023, y su motor de justificado corta renglones distinto que Word; la 26.2
# igualó el diagramado de Word en el laboratorio local) + fuentes core de
# Microsoft reales + un servidor HTTP de Node sin dependencias.
FROM node:22-slim

# Dependencias de runtime de LibreOffice headless + herramientas de descarga.
RUN apt-get update && apt-get install -y --no-install-recommends \
      wget ca-certificates \
      libx11-6 libxext6 libxrender1 libxtst6 libxi6 libxinerama1 \
      libfreetype6 libcups2 libglib2.0-0 libcairo2 libdbus-1-3 libnss3 \
      libxml2 libxslt1.1 \
      fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

# Fuentes core de Microsoft REALES (Times New Roman, Arial, etc.): los .docx de
# escribanos usan Times New Roman. El instalador de Debian (contrib) las baja
# del canal oficial de Microsoft bajo su EULA gratuita de redistribución.
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get install -y --no-install-recommends ttf-mscorefonts-installer fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice 26.2.4 oficial (los .deb de TDF instalan en /opt/libreoffice26.2).
RUN wget -q "https://download.documentfoundation.org/libreoffice/stable/26.2.4/deb/x86_64/LibreOffice_26.2.4_Linux_x86-64_deb.tar.gz" -O /tmp/lo.tar.gz \
    && tar xzf /tmp/lo.tar.gz -C /tmp \
    && dpkg -i /tmp/LibreOffice_*/DEBS/*.deb \
    && rm -rf /tmp/lo.tar.gz /tmp/LibreOffice_*

ENV PATH="/opt/libreoffice26.2/program:${PATH}"

WORKDIR /app
COPY server.js .

# Render inyecta PORT (default 10000); el server lo lee del entorno.
EXPOSE 10000
CMD ["node", "server.js"]
