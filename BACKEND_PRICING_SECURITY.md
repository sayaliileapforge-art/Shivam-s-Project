# Backend Integration Guide - Dynamic Role-Based Pricing

## ⚠️ Important Security Note

The current frontend implementation is **production-ready for UI/UX**, but **backend security validation is REQUIRED** before handling real orders and payments.

## Backend Requirements

### 1. User Role Validation

**Problem:** Client-side role cannot be trusted. A malicious user could change their role in localStorage/session.

**Solution:** Validate role from JWT token on every request

```typescript
// middleware/auth.ts
import jwt from "jsonwebtoken";

interface TokenPayload {
  userId: string;
  role: "super_admin" | "master_vendor" | "sub_vendor" | "client" | "public";
  email: string;
}

export async function validateUserRole(req: Request): Promise<TokenPayload> {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    throw new Error("No authorization token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as TokenPayload;
    
    // Validate role is legitimate
    const validRoles = [
      "super_admin",
      "master_vendor",
      "sub_vendor",
      "sales_person",
      "designer_staff",
      "data_operator",
      "production_manager",
      "accounts_manager",
      "client",
    ];
    
    if (!validRoles.includes(decoded.role)) {
      throw new Error("Invalid role in token");
    }
    
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}
```

### 2. Price Retrieval with Role Validation

**Problem:** Frontend sends a price, but we should always calculate on backend.

**Solution:** Get product pricing, validate user role, calculate correct price

```typescript
// services/pricingService.ts
interface ProductPricing {
  vendorPrice: number;
  clientPrice: number;
  publicPrice: number;
}

interface PricingResult {
  productId: string;
  userRole: string;
  applicablePrice: number;
  calculatedAt: Date;
}

export function getPriceForRole(
  product: ProductPricing,
  userRole: string | null
): number {
  const vendorRoles = [
    "master_vendor",
    "sub_vendor",
    "sales_person",
    "designer_staff",
    "data_operator",
    "production_manager",
    "accounts_manager",
  ];

  // Validate price is present and positive
  if (product.vendorPrice < 0 || product.clientPrice < 0 || product.publicPrice < 0) {
    throw new Error("Invalid product pricing");
  }

  if (!userRole) {
    // Unauthenticated user
    return product.publicPrice;
  }

  if (userRole === "super_admin") {
    // Admin sees vendor price (cost)
    return product.vendorPrice;
  }

  if (vendorRoles.includes(userRole)) {
    return product.vendorPrice;
  }

  if (userRole === "client") {
    return product.clientPrice;
  }

  // Default fallback
  return product.publicPrice;
}

// Example Usage
const product = await Product.findById(productId);
const applicablePrice = getPriceForRole(product, userRole);
```

### 3. Order Price Verification

**Problem:** Client could send a fake price lower than actual.

**Solution:** Verify order price matches server calculation

```typescript
// routes/orders.ts
import express from "express";
import { validateUserRole } from "../middleware/auth";

const router = express.Router();

router.post("/orders", async (req, res) => {
  try {
    // Validate user role from token
    const user = await validateUserRole(req);
    
    const { productId, templateId, quantity, requestedPrice } = req.body;
    
    // Get product from DB
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Calculate CORRECT price on server
    const correctUnitPrice = getPriceForRole(product, user.role);
    const correctTotal = correctUnitPrice * quantity;
    
    // Verify client didn't try to send lower price
    if (requestedPrice && requestedPrice < correctUnitPrice) {
      console.warn(`Price manipulation attempt detected:`, {
        userId: user.userId,
        productId,
        requestedPrice,
        correctPrice: correctUnitPrice,
      });
      
      return res.status(400).json({
        error: "Invalid price provided",
        correctPrice: correctUnitPrice,
      });
    }

    // Create order with SERVER-CALCULATED price
    const order = await Order.create({
      userId: user.userId,
      productId,
      templateId,
      quantity,
      unitPrice: correctUnitPrice, // Use server-calculated price
      totalPrice: correctTotal,
      userRole: user.role,
      status: "pending",
      createdAt: new Date(),
    });

    // Log the order for audit trail
    await AuditLog.create({
      action: "ORDER_CREATED",
      userId: user.userId,
      resourceId: order.id,
      details: {
        productId,
        quantity,
        userRole: user.role,
        calculatedPrice: correctUnitPrice,
      },
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        totalPrice: correctTotal,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

export default router;
```

### 4. Price Update Validation

**Problem:** Non-Super Admin could try to update prices via API.

**Solution:** Enforce Super Admin role for all price updates

```typescript
// routes/products.ts
router.put("/products/:id/pricing", async (req, res) => {
  try {
    // Validate user role
    const user = await validateUserRole(req);
    
    // IMPORTANT: Only Super Admin can update prices
    if (user.role !== "super_admin") {
      // Log unauthorized attempt
      await AuditLog.create({
        action: "UNAUTHORIZED_PRICE_UPDATE_ATTEMPT",
        userId: user.userId,
        resourceId: req.params.id,
        details: {
          attemptedRole: user.role,
          timestamp: new Date(),
        },
      });
      
      return res.status(403).json({
        error: "Only Super Admin can modify pricing",
        userRole: user.role,
      });
    }

    const { vendorPrice, clientPrice, publicPrice } = req.body;
    
    // Validate all prices
    if (!isPositiveNumber(vendorPrice) ||
        !isPositiveNumber(clientPrice) ||
        !isPositiveNumber(publicPrice)) {
      return res.status(400).json({
        error: "All prices must be positive numbers",
      });
    }

    // Optional: Validate logical pricing
    // (e.g., vendor < client < public for a tiered strategy)
    if (vendorPrice > publicPrice) {
      return res.status(400).json({
        warning: "Vendor price is higher than public price - is this intentional?"
      });
    }

    // Update product pricing
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        vendorPrice,
        clientPrice,
        publicPrice,
        updatedAt: new Date(),
      },
      { new: true }
    );

    // Log price change for audit trail
    await AuditLog.create({
      action: "PRODUCT_PRICING_UPDATED",
      userId: user.userId,
      resourceId: product.id,
      details: {
        oldPrices: {
          vendorPrice: product.vendorPrice, // Will be old values here
          clientPrice: product.clientPrice,
          publicPrice: product.publicPrice,
        },
        newPrices: {
          vendorPrice,
          clientPrice,
          publicPrice,
        },
        timestamp: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Prices updated successfully",
      product: {
        id: product.id,
        name: product.name,
        pricing: {
          vendorPrice,
          clientPrice,
          publicPrice,
        },
      },
    });
  } catch (error) {
    console.error("Price update error:", error);
    res.status(500).json({ error: "Failed to update pricing" });
  }
});

function isPositiveNumber(value: any): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
}
```

### 5. Audit Logging

**Problem:** No record of who changed what prices or pricing-related actions.

**Solution:** Log all pricing-related activities

```typescript
// models/AuditLog.ts
interface AuditLog {
  id: string;
  action: 
    | "ORDER_CREATED"
    | "PRODUCT_PRICING_UPDATED"
    | "UNAUTHORIZED_PRICE_UPDATE_ATTEMPT"
    | "PRICE_VERIFICATION_FAILED";
  userId: string;
  resourceId: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Example queries
// Find all price changes by a specific user
const priceChanges = await AuditLog.find({
  userId: "user_123",
  action: "PRODUCT_PRICING_UPDATED",
});

// Find unauthorized attempts
const attacks = await AuditLog.find({
  action: "UNAUTHORIZED_PRICE_UPDATE_ATTEMPT",
});

// Price at a specific date
const oldPrice = await AuditLog.find({
  action: "PRODUCT_PRICING_UPDATED",
  resourceId: "product_123",
  timestamp: { $lte: new Date("2024-01-01") },
}).sort({ timestamp: -1 }).limit(1);
```

### 6. Role-Based Order Restrictions

**Problem:** What if orders should be restricted by role?

**Solution:** Implement order visibility/access control

```typescript
// services/orderService.ts
export async function getUserOrders(userId: string, userRole: string) {
  let query: any = {};

  if (userRole === "super_admin") {
    // Super Admin sees all orders
    query = {};
  } else if (userRole === "client") {
    // Clients see only their own orders
    query = { userId };
  } else if (userRole.includes("vendor")) {
    // Vendors see orders of their clients
    // (requires client-vendor relationship)
    const clientIds = await getVendorClients(userId);
    query = { userId: { $in: clientIds } };
  } else {
    // Public users cannot view orders
    return [];
  }

  return Order.find(query).sort({ createdAt: -1 });
}
```

### 7. Database Indexes for Performance

```typescript
// migrations/indexing.ts
// For fast price lookups
db.products.createIndex({ "pricing.vendorPrice": 1 });
db.products.createIndex({ "pricing.clientPrice": 1 });
db.products.createIndex({ "pricing.publicPrice": 1 });

// For fast order queries by role
db.orders.createIndex({ userId: 1, userRole: 1 });
db.orders.createIndex({ createdAt: -1 });

// For audit trail
db.auditLogs.createIndex({ userId: 1, action: 1 });
db.auditLogs.createIndex({ timestamp: -1 });
```

## Testing Backend Security

### Test 1: Price Manipulation
```bash
# Try to create order with lower price
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "quantity": 1,
    "requestedPrice": 100
  }'

# Expected: Should fail if calculated price > 100
```

### Test 2: Unauthorized Role Change
```bash
# Try to update pricing without Super Admin role
curl -X PUT http://localhost:3000/api/products/prod_123/pricing \
  -H "Authorization: Bearer <client-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorPrice": 10,
    "clientPrice": 20,
    "publicPrice": 30
  }'

# Expected: 403 Forbidden
```

### Test 3: Price Verification
```bash
# Create order with correct price
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "quantity": 1,
    "requestedPrice": 2500  # Correct price for role
  }'

# Expected: 200 OK with order created
```

## Deployment Checklist

### Before Going Live:
- [ ] Implement JWT role validation
- [ ] Add order price verification
- [ ] Enforce Super Admin for pricing endpoints
- [ ] Add comprehensive audit logging
- [ ] Test price manipulation scenarios
- [ ] Test role-based access control
- [ ] Add database indexes
- [ ] Set up monitoring alerts
- [ ] Document pricing strategy
- [ ] Train team on security practices
- [ ] Review with security team
- [ ] Implement rate limiting on pricing endpoints
- [ ] Add CORS security headers

### Monitoring & Alerting:
- Alert on unauthorized price update attempts
- Monitor for suspicious price patterns
- Track price change frequency
- Alert on order price mismatches
- Log all Super Admin changes

## Common Vulnerabilities & Solutions

| Vulnerability | Risk | Solution |
|---|---|---|
| Client-set prices used | High | Always calculate on server |
| No role validation | High | Validate JWT token always |
| No price change audit | Medium | Log all modifications |
| Unauthorized API access | High | Enforce Super Admin checks |
| Price injection attacks | Medium | Validate and sanitize inputs |
| No rate limiting | Medium | Implement API rate limits |
| No transaction logs | Medium | Add audit logging to DB |

---

**Status:** This guide provides the backend patterns needed. Implement before accepting real payments.
