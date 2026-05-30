# Puchar Felka — obraz aplikacji (Node.js)
FROM node:22-alpine

# Katalog roboczy
WORKDIR /app

# Najpierw zależności (lepsze wykorzystanie cache warstw Dockera)
COPY package.json ./
RUN npm install --omit=dev

# Reszta projektu
COPY . .

# Uruchamiamy jako użytkownik bez uprawnień roota
USER node

ENV PORT=3000
EXPOSE 3000

# Health-check korzysta z endpointu /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
