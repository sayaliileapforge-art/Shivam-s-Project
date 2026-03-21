
# Enterprise SaaS Admin Portal

Enterprise SaaS Admin Portal with MongoDB backend integration. This is a full-stack solution featuring a React-based design tool (built with Fabric.js) connected to a MongoDB database via Node.js/Express backend.

**Original Design:** https://www.figma.com/design/qVTsJ5L3GQVOVJ2N1Q7Sm3/Enterprise-SaaS-Admin-Portal

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (credentials already configured)

### Installation & Running

**Option 1: Run Backend and Frontend in Separate Terminals**

Terminal 1 - Backend:
```bash
cd backend
npm install
npm run dev
```
Backend runs on: `http://localhost:5000`

Terminal 2 - Frontend:
```bash
npm install
npm run dev
```
Frontend runs on: `http://localhost:5173`

**Option 2: Quick Commands**
```bash
# Install dependencies for both
npm install && cd backend && npm install && cd ..

# Run frontend (Terminal 1)
npm run dev

# Run backend (Terminal 2)
cd backend && npm run dev
```

## Architecture

### Frontend (React + Vite + TypeScript)
- **Design Canvas Tool** - Fabric.js-based visual editor with 30+ tools
- **UI Components** - Shadcn/ui + Radix UI
- **State Management** - Local stores for projects, clients, products
- **Styling** - Tailwind CSS + custom themes
- **Keyboard Shortcuts** - Full shortcut support (V=select, H=hand, T=text, Ctrl+Z=undo, etc.)

### Backend (Node.js + Express + MongoDB)
- **Database** - MongoDB Atlas (mutable schema, JSON-like documents)
- **ODM** - Mongoose for type-safe queries
- **API** - RESTful endpoints for CRUD operations
- **Port** - `:5000` (proxied from frontend via Vite)

### Database Models
- **Projects** - Design projects with canvas data
- **Templates** - Reusable design templates
- **Products** - Catalog with pricing and visibility
- **Clients** - Client information and relationships
- **DataRecords** - Variable data for print jobs with barcodes/QR codes

## Features

### Design Tools
- ✅ Text editing (font, size, color, background, padding)
- ✅ Shapes (rectangles, circles, triangles, polygons, stars, etc.)
- ✅ Pen/Freehand drawing
- ✅ QR Code & Barcode generation
- ✅ Image upload with masking (14+ templates)
- ✅ Layer management (lock/unlock/delete)
- ✅ Undo/Redo (30-action history)
- ✅ Multi-page support
- ✅ Background customization (color, image, SVG)
- ✅ Curved text support
- ✅ Keyboard shortcuts
- ✅ Export (PNG, JPG, PDF, JSON)

### API Endpoints
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create client
- `GET /api/products` - List products (filterable)
- `POST /api/products` - Create product
- `GET /health` - Server health check

## Project Structure

```
├── src/                          # Frontend source
│   ├── app/
│   │   ├── components/
│   │   │   ├── designer/        # Fabric.js canvas & tools
│   │   │   │   ├── FabricCanvas.tsx      # Core canvas wrapper
│   │   │   │   ├── DesignerStudio.tsx    # Main designer page
│   │   │   │   ├── PropertiesPanel.tsx   # Object properties UI
│   │   │   │   ├── ElementsPanel.tsx     # Layers/objects list
│   │   │   │   ├── RulerComponent.tsx    # Measurements
│   │   │   │   └── ContextToolbar.tsx    # Quick access toolbar
│   │   │   ├── figma/           # Component imports
│   │   │   └── ui/              # Shadcn/ui components
│   │   ├── pages/               # Page routes
│   │   └── routes.tsx           # Route definitions
│   └── lib/
│       ├── *Store.ts            # Zustand state stores
│       ├── fabricUtils.ts        # Fabric.js utilities
│       └── rbac/                # Auth & RBAC reference
│
├── backend/                      # Node.js/Express backend
│   ├── src/
│   │   ├── server.ts            # Express app setup
│   │   ├── config/
│   │   │   └── database.ts      # MongoDB connection
│   │   ├── models/              # Mongoose schemas
│   │   │   ├── Project.ts
│   │   │   ├── Template.ts
│   │   │   ├── Product.ts
│   │   │   ├── Client.ts
│   │   │   └── DataRecord.ts
│   │   └── routes/              # API route handlers
│   │       ├── projects.ts
│   │       ├── clients.ts
│   │       └── products.ts
│   ├── .env                     # MongoDB credentials
│   ├── .env.example             # Template
│   └── package.json
│
├── package.json                 # Frontend dependencies
├── vite.config.ts              # Vite + API proxy config
└── tsconfig.json               # TypeScript config
```

## Configuration

### MongoDB Connection
Edit `backend/.env` to change connection settings:
```
MONGODB_URI=mongodb+srv://aaryaleap_db_user:4seP0xHMZOhgaGRD@cluster0.3zq4ych.mongodb.net/?appName=Cluster0
PORT=5000
```

### API Proxy (Vite)
Frontend automatically proxies `/api/*` requests to `localhost:5000` during development (configured in `vite.config.ts`).

## Development

### Add New Backend Models
1. Create schema in `backend/src/models/YourModel.ts`
2. Create routes in `backend/src/routes/yourmodel.ts`
3. Import route in `backend/src/server.ts`: `app.use('/api/yourmodel', yourmodelRoutes)`

### Connect Frontend to API
Replace store implementations in `src/lib/` to call APIs instead of local storage:
```typescript
// Example: projectStore.ts
const response = await fetch('/api/projects');
const projects = await response.json();
```

### Environment Variables
Frontend: Create `src/.env.local` if needed
Backend: Already configured in `backend/.env`

## Deployment

### Deploy on Render

This repo includes a Render blueprint file at render.yaml for deploying both services:

- Frontend static site (Vite build output)
- Backend Node web service (Express + MongoDB)

Steps:

1. Push your latest code to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render will detect render.yaml and create two services.
4. Set backend environment variables:
	- MONGODB_URI
	- CORS_ORIGIN (set to your frontend Render URL)
	- FRONTEND_URL (same frontend URL)
5. Set frontend environment variable:
	- VITE_API_BASE_URL (set to your backend Render URL, for example https://your-backend.onrender.com)
6. Deploy both services.

After deployment:

- Backend health check: /health
- Frontend serves SPA routes via rewrite to /index.html

### Production Build

**Frontend:**
```bash
npm run build
# Creates optimized build in dist/
```

**Backend:**
```bash
cd backend
npm run build
npm start
```

## Security Notes

⚠️ The project includes RBAC middleware templates in `src/lib/rbac/backend/`. For production:
- Implement JWT authentication
- Validate user roles on backend
- Add permission checks
- Use HTTPS for API communication
- Store sensitive environment variables securely
- Implement rate limiting

## Support

For issues or questions about specific features:
- Designer tool: See `src/app/components/designer/` comments
- Database schema: See `backend/src/models/`
- API usage: See `backend/README.md`

## Original Design

This project is built from a Figma design at:
https://www.figma.com/design/qVTsJ5L3GQVOVJ2N1Q7Sm3/Enterprise-SaaS-Admin-Portal
  