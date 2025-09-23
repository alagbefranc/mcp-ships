FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server files
COPY cruisemapper-server-enhanced.js ./
COPY web-server.js ./

# Expose port for web server
EXPOSE 8080

# Start the web server
CMD ["node", "web-server.js"]
