-- DeployWatch PostgreSQL Initialization Script
-- Creates required extensions and database defaults

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE deploywatch TO deploywatch;
