/**
 * Data Migration Tool
 * Migrates existing localStorage data to MongoDB via backend APIs
 */

import * as api from './apiService';

export interface MigrationResult {
  success: boolean;
  message: string;
  itemsMigrated: number;
  errors: string[];
}

export async function migrateProjectsToMongoDB(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: '',
    itemsMigrated: 0,
    errors: [],
  };

  try {
    const projects = JSON.parse(localStorage.getItem('vendor_projects') || '[]');
    
    for (const project of projects) {
      try {
        await api.createProject({
          name: project.name,
          description: project.description || '',
          clientId: project.clientId,
          status: project.stage || 'draft',
          pages: 1,
          canvasData: [],
        });
        result.itemsMigrated++;
      } catch (error) {
        result.errors.push(`Project "${project.name}": ${(error as Error).message}`);
      }
    }

    result.message = `Successfully migrated ${result.itemsMigrated} projects`;
    return result;
  } catch (error) {
    result.success = false;
    result.message = `Migration failed: ${(error as Error).message}`;
    return result;
  }
}

export async function migrateClientsToMongoDB(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: '',
    itemsMigrated: 0,
    errors: [],
  };

  try {
    const clients = JSON.parse(localStorage.getItem('vendor_clients') || '[]');
    
    for (const client of clients) {
      try {
        await api.createClient({
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
        });
        result.itemsMigrated++;
      } catch (error) {
        result.errors.push(`Client "${client.name}": ${(error as Error).message}`);
      }
    }

    result.message = `Successfully migrated ${result.itemsMigrated} clients`;
    return result;
  } catch (error) {
    result.success = false;
    result.message = `Migration failed: ${(error as Error).message}`;
    return result;
  }
}

export async function migrateProductsToMongoDB(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: '',
    itemsMigrated: 0,
    errors: [],
  };

  try {
    const products = JSON.parse(localStorage.getItem('vendor_products') || '[]');
    
    for (const product of products) {
      try {
        const existingImages = Array.isArray(product.images) ? product.images : [];
        await api.createProduct({
          name: product.name,
          description: product.description || '',
          images: existingImages.length > 0
            ? existingImages
            : [
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"%3E%3Crect fill="%23e5e7eb" width="1200" height="800"/%3E%3Ctext x="50%25" y="50%25" fill="%236b7280" dominant-baseline="middle" text-anchor="middle" font-size="48"%3EMigrated%20Product%3C/text%3E%3C/svg%3E',
              ],
          sku: product.sku || `SKU-${Date.now()}`,
          category: product.category || 'general',
          price: product.price || 0,
          stock: product.stock || 0,
          visibility: product.visibility || 'public',
          applicableFor: product.visibleTo || ['Public'],
          isVisible: true,
          width: product.width,
          height: product.height,
          unit: product.unit,
        });
        result.itemsMigrated++;
      } catch (error) {
        result.errors.push(`Product "${product.name}": ${(error as Error).message}`);
      }
    }

    result.message = `Successfully migrated ${result.itemsMigrated} products`;
    return result;
  } catch (error) {
    result.success = false;
    result.message = `Migration failed: ${(error as Error).message}`;
    return result;
  }
}

export async function migrateAllDataToMongoDB(): Promise<{
  projects: MigrationResult;
  clients: MigrationResult;
  products: MigrationResult;
  totalMigrated: number;
}> {
  console.log('🔄 Starting data migration to MongoDB...');

  const projectsResult = await migrateProjectsToMongoDB();
  console.log(`✓ Projects: ${projectsResult.message}`);

  const clientsResult = await migrateClientsToMongoDB();
  console.log(`✓ Clients: ${clientsResult.message}`);

  const productsResult = await migrateProductsToMongoDB();
  console.log(`✓ Products: ${productsResult.message}`);

  const total =
    projectsResult.itemsMigrated +
    clientsResult.itemsMigrated +
    productsResult.itemsMigrated;

  if (projectsResult.errors.length > 0) {
    console.error('⚠️ Project migration errors:', projectsResult.errors);
  }
  if (clientsResult.errors.length > 0) {
    console.error('⚠️ Client migration errors:', clientsResult.errors);
  }
  if (productsResult.errors.length > 0) {
    console.error('⚠️ Product migration errors:', productsResult.errors);
  }

  console.log(`\n✅ Migration complete! Total items migrated: ${total}`);

  return {
    projects: projectsResult,
    clients: clientsResult,
    products: productsResult,
    totalMigrated: total,
  };
}
