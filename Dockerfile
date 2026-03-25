# -----------------------------------------------------------------------------
# Stage 1: Compilation
# -----------------------------------------------------------------------------
    FROM node:20-alpine AS builder

    WORKDIR /app
    
    # Install dependencies
    COPY package*.json ./
    # Use 'npm install' instead of 'npm ci' to allow for automatic lockfile sync during build
    RUN npm install
    
    # Copy source code and build the application
    COPY . .
    RUN npm run build
    
    # -----------------------------------------------------------------------------
    # Stage 2: Production Web Server
    # -----------------------------------------------------------------------------
    FROM nginxinc/nginx-unprivileged:1.25-alpine-slim
    
    # Set working directory to Nginx public html folder
    WORKDIR /usr/share/nginx/html
    
    # Transfer compiled static payload from the builder stage
    COPY --from=builder /app/dist ./
    
    # Configure Nginx for Single Page Application (SPA) routing
    RUN echo 'server { \
        listen 8080; \
        location / { \
            root /usr/share/nginx/html; \
            index index.html; \
            try_files $uri $uri/ /index.html; \
        } \
    }' > /etc/nginx/conf.d/default.conf
    
    EXPOSE 8080
    
    CMD ["nginx", "-g", "daemon off;"]
