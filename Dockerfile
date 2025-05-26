# Imagen base (Node.js 23 sobre Alpine)
FROM azeupvprddvoacr01.azurecr.io/node:23-alpine

# Metadatos
LABEL maintainer="Pendigital"
LABEL dominio="DOMAINWS"

# Creamos un grupo y un usuario 'userapp' sin privilegios
RUN addgroup -S userapp && adduser -S userapp -G userapp

# Creamos el directorio de la aplicación
WORKDIR /opt/node

# Copiamos los archivos necesarios para instalar dependencias
COPY package*.json ./

# Instalamos TODAS las dependencias (dev + prod)
RUN npm install

# Copiamos el resto del proyecto
COPY . .

# Compilamos (genera la carpeta dist/)
RUN npm run build

# Ajustamos los permisos del directorio /opt/node para el usuario 'userapp'
RUN chown -R userapp:userapp /opt/node

# Cambiamos a usuario 'userapp' para evitar privilegios de root en runtime
USER userapp

# Expone el puerto en el que escucha tu aplicación NestJS (por defecto 3000)
EXPOSE ${PORT}

# Comando de arranque de la aplicación (usa el dist/ compilado)
CMD ["npm", "run", "start"]
