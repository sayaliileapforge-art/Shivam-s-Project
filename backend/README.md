# Backend Setup Guide

## Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. The `.env` file is already configured with your MongoDB connection string

## Running the Backend Server

Start the development server:
```bash
npm run dev
```

The backend will start on `http://localhost:5000`

## Commands

- `npm run dev` - Start development server (auto-reload with tsx)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server

## API Endpoints

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get project by ID
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Products
- `GET /api/products` - Get all products (supports ?category= and ?visibility= filters)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Health Check
- `GET /health` - Server health status

## MongoDB Connection

Connected to: **aaryaleap_db_user** cluster on MongoDB Atlas

The connection string is stored in `.env` file (do not commit this to git).

## Development

### Database (MongoDB)
- Schema definitions in `src/models/`
- Using Mongoose ODM for type-safe queries

### Routes
- API routes in `src/routes/`
- Each entity (projects, clients, products) has its own router

### Configuration
- Database connection in `src/config/database.ts`
- Environment variables in `.env`

## Testing

Once both frontend and backend are running:

1. Frontend runs on: `http://localhost:5173`
2. Backend serves API on: `http://localhost:5000`
3. Frontend proxies `/api/*` to backend via Vite configuration

To test the connection:
```bash
curl http://localhost:5000/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```
