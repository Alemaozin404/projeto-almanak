# ── Servidor Pix (Mercado Pago) — imagem de produção ──
# O Railway detecta este Dockerfile automaticamente (Root Directory = server).

FROM node:20-alpine

# Segurança básica: roda como usuário sem privilégios
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copia primeiro só as dependências (aproveita cache de camadas do Docker)
COPY package.json ./
# Sem package-lock.json, usa npm install (reprodutível o suficiente p/ este serviço)
RUN npm install --omit=dev && npm cache clean --force

# Copia o código-fonte
COPY index.js ./

# Usuário não-root
USER app

# O Railway injeta a porta real em PORT (não fixamos aqui)
EXPOSE 8787

ENV NODE_ENV=production

CMD ["node", "index.js"]
