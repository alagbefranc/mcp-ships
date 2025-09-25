FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install chromium

# Copy server files
COPY cruisemapper-server-enhanced.js ./
COPY web-server.js ./

# Expose port for web server
EXPOSE 8080

# Set environment variables for headless operation
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Start the web server
CMD ["node", "web-server.js"]