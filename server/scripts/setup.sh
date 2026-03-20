#!/bin/bash

# Suya Surf Server Setup Script
# This script sets up the development environment

set -e

echo "🚀 Setting up Suya Surf Server..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if Node.js is installed
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
        
        # Check if version is 18+
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$MAJOR_VERSION" -lt 18 ]; then
            print_error "Node.js version 18 or higher is required"
            exit 1
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
}

# Check if npm is installed
check_npm() {
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    else
        print_error "npm is not installed"
        exit 1
    fi
}

# Check if PostgreSQL is installed
check_postgres() {
    if command -v psql &> /dev/null; then
        POSTGRES_VERSION=$(psql --version | awk '{print $3}')
        print_success "PostgreSQL found: $POSTGRES_VERSION"
    else
        print_warning "PostgreSQL not found. Please install PostgreSQL 15 or higher."
        echo "   macOS: brew install postgresql@15"
        echo "   Ubuntu: sudo apt-get install postgresql postgresql-contrib"
        echo "   Windows: Download from https://www.postgresql.org/download/windows/"
    fi
}

# Check if Redis is installed
check_redis() {
    if command -v redis-cli &> /dev/null; then
        REDIS_VERSION=$(redis-cli --version | awk '{print $2}')
        print_success "Redis found: $REDIS_VERSION"
    else
        print_warning "Redis not found. Please install Redis 7 or higher."
        echo "   macOS: brew install redis"
        echo "   Ubuntu: sudo apt-get install redis-server"
        echo "   Windows: Download from https://redis.io/download"
    fi
}

# Create environment file
setup_env() {
    if [ ! -f .env ]; then
        print_success "Creating .env file from template"
        cp .env.example .env
        print_warning "Please edit .env file with your configuration"
    else
        print_success ".env file already exists"
    fi
}

# Install dependencies
install_dependencies() {
    print_success "Installing Node.js dependencies..."
    npm install
}

# Create necessary directories
create_directories() {
    print_success "Creating necessary directories..."
    mkdir -p uploads/audio
    mkdir -p uploads/downloads
    mkdir -p uploads/tts
    mkdir -p uploads/temp
    mkdir -p logs
    mkdir -p credentials
    mkdir -p nginx/ssl
}

# Setup database
setup_database() {
    print_success "Setting up database..."
    
    # Check if database exists
    if command -v psql &> /dev/null; then
        # Try to connect to suyasurf database
        if psql -lqt | cut -d \| -f 1 | grep -qw suyasurf; then
            print_success "Database 'suyasurf' already exists"
        else
            print_warning "Database 'suyasurf' not found. Creating it..."
            createdb suyasurf 2>/dev/null || {
                print_error "Failed to create database. Please create it manually:"
                echo "   createdb suyasurf"
                echo "   psql -d suyasurf -f database/schema.sql"
                return 1
            }
        fi
        
        # Run schema if database is empty
        TABLE_COUNT=$(psql -d suyasurf -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
        if [ "$TABLE_COUNT" -eq 0 ]; then
            print_success "Running database schema..."
            psql -d suyasurf -f database/schema.sql
        else
            print_success "Database schema already exists"
        fi
    else
        print_warning "PostgreSQL not available. Please setup database manually:"
        echo "   createdb suyasurf"
        echo "   psql -d suyasurf -f database/schema.sql"
    fi
}

# Setup Redis
setup_redis() {
    if command -v redis-cli &> /dev/null; then
        # Check if Redis is running
        if redis-cli ping &> /dev/null; then
            print_success "Redis is running"
        else
            print_warning "Redis is not running. Please start it:"
            echo "   macOS: brew services start redis"
            echo "   Ubuntu: sudo systemctl start redis-server"
            echo "   Windows: redis-server"
        fi
    fi
}

# Generate SSL certificates for development
generate_ssl() {
    if [ ! -f nginx/ssl/cert.pem ]; then
        print_success "Generating development SSL certificates..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/key.pem \
            -out nginx/ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    else
        print_success "SSL certificates already exist"
    fi
}

# Setup complete
setup_complete() {
    print_success "Setup completed! 🎉"
    echo
    echo "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Start PostgreSQL and Redis services"
    echo "3. Run 'npm run dev' to start the development server"
    echo "4. Visit http://localhost:3000/health to verify setup"
    echo
    echo "For production deployment:"
    echo "1. Set NODE_ENV=production in .env"
    echo "2. Use 'docker-compose up -d' for containerized deployment"
    echo "3. Configure proper SSL certificates"
    echo
}

# Main setup flow
main() {
    echo "Checking prerequisites..."
    check_node
    check_npm
    check_postgres
    check_redis
    
    echo
    echo "Setting up environment..."
    setup_env
    install_dependencies
    create_directories
    
    echo
    echo "Setting up services..."
    setup_database
    setup_redis
    generate_ssl
    
    echo
    setup_complete
}

# Run main function
main "$@"
