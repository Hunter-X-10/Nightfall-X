# Imagen del servidor de NIGHTFALL-X: sirve el juego y lleva las salas en línea.
# Vale para cualquier alojamiento de contenedores (Hugging Face Spaces, Back4app Containers, entre otros).
FROM node:22-alpine

WORKDIR /app

# Sólo las dependencias de ejecución (three y ws).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js rooms.js index.html ./
COPY css ./css
COPY src ./src

# Con PORT definido, el servidor acepta conexiones de fuera.
ENV PORT=7860
EXPOSE 7860

USER node
CMD ["node", "server.js"]
