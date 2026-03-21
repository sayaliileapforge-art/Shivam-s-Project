import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Activity, Database, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = '/api';

async function checkBackendHealth() {
  try {
    const response = await fetch('/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function migrateAllDataToMongoDB() {
  const projectsData: any[] = JSON.parse(localStorage.getItem('vendor_projects') || '[]');
  const clientsData: any[] = JSON.parse(localStorage.getItem('vendor_clients') || '[]');
  const productsData: any[] = JSON.parse(localStorage.getItem('vendor_products') || '[]');

  let projectsMigrated = 0;
  let clientsMigrated = 0;
  let productsMigrated = 0;
  const errors: string[] = [];

  // Migrate Projects
  for (const project of projectsData) {
    try {
      await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          description: project.description || '',
          clientId: project.clientId,
          status: project.stage || 'draft',
          pages: 1,
          canvasData: [],
        }),
      });
      projectsMigrated++;
    } catch (error) {
      errors.push(`Project "${project.name}": ${(error as Error).message}`);
    }
  }

  // Migrate Clients
  for (const client of clientsData) {
    try {
      await fetch(`${API_BASE}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: client.name,
          email: client.email || '',
          phone: client.phone || '',
          address: client.address || '',
          city: client.city || '',
          state: client.state || '',
          zipCode: client.zipCode || '',
          country: client.country || '',
          companyName: client.companyName || '',
          status: 'active',
        }),
      });
      clientsMigrated++;
    } catch (error) {
      errors.push(`Client "${client.name}": ${(error as Error).message}`);
    }
  }

  // Migrate Products
  for (const product of productsData) {
    try {
      await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: product.name,
          description: product.description || '',
          sku: product.sku || `SKU-${Date.now()}`,
          category: product.category || 'general',
          price: product.price || 0,
          stock: product.stock || 0,
          visibility: product.visibility || 'public',
          width: product.width,
          height: product.height,
          unit: product.unit,
        }),
      });
      productsMigrated++;
    } catch (error) {
      errors.push(`Product "${product.name}": ${(error as Error).message}`);
    }
  }

  return {
    projects: { itemsMigrated: projectsMigrated, errors: errors.filter(e => e.includes('Project')) },
    clients: { itemsMigrated: clientsMigrated, errors: errors.filter(e => e.includes('Client')) },
    products: { itemsMigrated: productsMigrated, errors: errors.filter(e => e.includes('Product')) },
    totalMigrated: projectsMigrated + clientsMigrated + productsMigrated,
  };
}

export default function DataMigration() {
  const [loading, setLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [localStats, setLocalStats] = useState({
    projects: 0,
    clients: 0,
    products: 0,
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check backend health
    checkBackendHealth().then(setBackendOnline);

    // Count local data
    const projects = JSON.parse(localStorage.getItem('vendor_projects') || '[]');
    const clients = JSON.parse(localStorage.getItem('vendor_clients') || '[]');
    const products = JSON.parse(localStorage.getItem('vendor_products') || '[]');

    setLocalStats({
      projects: projects.length,
      clients: clients.length,
      products: products.length,
    });
  }, []);

  const handleMigrate = async () => {
    if (!backendOnline) {
      setError('❌ Backend is not online. Make sure npm run dev is running in the backend folder.');
      return;
    }

    const totalItems = localStats.projects + localStats.clients + localStats.products;
    if (totalItems === 0) {
      setError('No local data to migrate');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const migrationResult = await migrateAllDataToMongoDB();
      setResult(migrationResult);
    } catch (err) {
      setError(`Migration failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalItems = localStats.projects + localStats.clients + localStats.products;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Database className="w-8 h-8 text-blue-600" />
            Migrate Data to MongoDB
          </h1>
          <p className="text-gray-600 mt-2">Move your local data to the cloud database</p>
        </div>

        {/* Backend Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Backend Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {backendOnline ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span>✅ Backend is online (http://localhost:5000)</span>
              </div>
            ) : (
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  ❌ Backend is offline. Start it with: cd backend && npm run dev
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Local Data Stats */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Local Data Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{localStats.projects}</div>
                <div className="text-sm text-gray-600">Projects</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{localStats.clients}</div>
                <div className="text-sm text-gray-600">Clients</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{localStats.products}</div>
                <div className="text-sm text-gray-600">Products</div>
              </div>
            </div>
            <div className="mt-4 text-lg font-semibold text-gray-700">
              Total: <span className="text-blue-600">{totalItems} items</span>
            </div>
          </CardContent>
        </Card>

        {/* Migration Results */}
        {result && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                Migration Complete! ✅
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>📦 Projects: <span className="font-bold">{result.projects.itemsMigrated}</span> migrated</div>
              <div>👥 Clients: <span className="font-bold">{result.clients.itemsMigrated}</span> migrated</div>
              <div>🛍️ Products: <span className="font-bold">{result.products.itemsMigrated}</span> migrated</div>
              <div className="mt-4 pt-4 border-t border-green-200">
                <strong>Total: {result.totalMigrated} items successfully saved to MongoDB!</strong>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={handleMigrate}
            disabled={loading || !backendOnline || totalItems === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
          >
            {loading ? '🔄 Migrating...' : `📤 Migrate ${totalItems} Items to MongoDB`}
          </Button>
          <Button
            onClick={() => (window.location.href = '/check-data.html')}
            variant="outline"
            className="flex-1"
          >
            👁️ View Raw Data
          </Button>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-700">
          <p className="font-semibold mb-2">ℹ️ What happens during migration:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Your local data is read from browser storage</li>
            <li>Each item is sent to the backend API</li>
            <li>Data is stored in MongoDB database</li>
            <li>Local storage remains unchanged (as backup)</li>
            <li>You can now access your data from any device!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
