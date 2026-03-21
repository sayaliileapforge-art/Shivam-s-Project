# Dynamic Role-Based Pricing Implementation Guide

## Overview
Complete role-based dynamic pricing system with Super Admin control has been successfully implemented. The system automatically displays different prices to different user roles and only Super Admin can manage pricing.

## Architecture

### 1. Data Layer (`/src/lib/productStore.ts`)
Updated Product interface now includes:
```typescript
interface Product {
  // ... existing fields ...
  vendorPrice: number;      // For Vendor/Master Vendor/Sub Vendor/Staff roles
  clientPrice: number;      // For Client role
  publicPrice: number;      // For Public/unauthenticated users
}
```

### 2. Pricing Utility Module (`/src/lib/pricingUtils.ts`)
New utility file with role-based pricing functions:

#### Key Functions:
- **`getPriceByRole(product, userRole)`**
  - Maps user role to appropriate price tier
  - Returns the correct price based on user's role
  - Fallback behavior for unknown roles

- **`formatPrice(price, currency)`**
  - Formats price in Indian rupees by default
  - Handles locale-specific number formatting
  - Example: ₹10,000.00

- **`validatePricing(pricing)`**
  - Validates all three price fields
  - Returns validation errors for each field
  - Ensures prices are non-negative numbers

- **`canEditPrices(userRole)`**
  - Checks if user is Super Admin
  - Controls UI access to pricing fields
  - Returns boolean

- **`getRoleDisplayName(userRole)`**
  - Returns human-readable role name
  - Used in UI to display pricing context

### 3. Role Mapping

**Vendor Price** (Wholesale/Internal):
- Master Vendor
- Sub Vendor
- Sales Person
- Designer Staff
- Data Operator
- Production Manager
- Accounts Manager
- Super Admin (business cost view)

**Client Price**:
- Client

**Public Price**:
- Anonymous/Unauthenticated users

## UI Components

### 1. ProductForm (Updated)
**File:** `/src/app/components/products/ProductForm.tsx`

**Features:**
- ✅ Super Admin only pricing section
- ✅ Three separate price input fields (Vendor, Client, Public)
- ✅ Real-time price formatting preview
- ✅ Form validation with error messages
- ✅ Permission warning for non-Super Admin users
- ✅ Locked fields for regular users

**Form Behavior:**
```
Non-Super Admin User:
├─ Alert: "Pricing fields are managed by Super Admin only"
├─ Can set: Product info, images, videos, templates, visibility
└─ Cannot edit: Vendor/Client/Public prices

Super Admin User:
├─ Blue highlighted pricing section
├─ Three price input fields with:
│  ├─ Real-time price formatting
│  ├─ Input validation
│  └─ User-friendly labels
└─ Can manage all fields
```

### 2. ProductDetails (Updated)
**File:** `/src/app/components/products/ProductDetails.tsx`

**Features:**
- ✅ Displays correct price based on logged-in user's role
- ✅ Shows user role name (Vendor/Client/Public)
- ✅ Prominent price display with gradient background
- ✅ Currency formatting (₹ symbol)
- ✅ Responsive design

**Display Example:**
```
┌─────────────────────────────┐
│ Your Price (Client)         │ ← Role label
│ ₹2,500.00                   │ ← Formatted price
└─────────────────────────────┘
```

### 3. Products Page (Updated)
**File:** `/src/app/pages/Products.tsx`

**Features:**
- ✅ Product grid with role-based pricing
- ✅ Price display on each product card
- ✅ Shows user's role name with price
- ✅ Real-time price updates based on logged-in user

**Card Display:**
```
┌─────────────────────┐
│   Product Image     │
├─────────────────────┤
│ Product Name        │
│ Description         │
├─────────────────────┤
│ Client (you)        │
│ ₹1,500.00           │ ← Your perceived price
├─────────────────────┤
│ Visibility badges   │
│ Media icons         │
│ Edit | Delete       │
└─────────────────────┘
```

### 4. ProductDetailsPage (Updated)
**File:** `/src/app/pages/ProductDetailsPage.tsx`

**Features:**
- ✅ Complete product view with role-based price
- ✅ Order confirmation includes pricing info
- ✅ Passes correct price to order system
- ✅ Shows role context in order details

**Order Confirmation:**
```
Order placed successfully!

📦 Product: Photo Book A4
🎨 Template: Matte Finish
💰 Price: ₹2,500.00 (Client)

✉️ Order confirmation will be sent to your email.
```

## Security Considerations

### ✅ Frontend Security
1. **Non-Super Admin users cannot access pricing UI:**
   - Price input fields are conditionally rendered
   - Only visible to Super Admin role
   - Permission warning displayed for other users

2. **Price display is role-appropriate:**
   - Each user sees only their tier price
   - Cannot access hidden price fields
   - Correct price is calculated client-side

### ⚠️ Backend Security (Requires Implementation)
1. **Validate user role on server:**
   - Verify user's role from JWT token
   - Enforce pricing based on authenticated role
   - Reject unauthorized price updates

2. **Prevent price manipulation:**
   - Only allow Super Admin to update prices
   - Validate all price updates on backend
   - Audit price changes in logs

3. **Use correct price for orders:**
   - Server-side calculation of order total
   - Never trust client-sent prices
   - Verify product pricing against database

### ✅ Data Access Control
- Super Admin can see/edit all three prices
- Regular users see only their tier price
- Pricing prevents unauthorized access to business data

## Implementation Steps

### Step 1: Create Pricing Utility
```typescript
// /src/lib/pricingUtils.ts
- getPriceByRole()
- formatPrice()
- validatePricing()
- canEditPrices()
- getRoleDisplayName()
```

### Step 2: Update Product Model
```typescript
// Product interface with three price fields
vendorPrice: number
clientPrice: number
publicPrice: number
```

### Step 3: Update Product Form
- Add conditional pricing section for Super Admin
- Add three price input fields
- Add validation for all prices
- Show permission warning for non-Admin users

### Step 4: Update Display Components
- ProductDetails: Show role-appropriate price
- Products Page: Show price on cards
- ProductDetailsPage: Include price in orders

### Step 5: Backend Integration (TODO)
- Validate user roles on server
- Enforce pricing rules on backend
- Audit price modifications
- Secure order processing

## Testing Checklist

### ✅ Frontend Testing
- [ ] Non-Super Admin users see permission warning
- [ ] Super Admin can edit all three prices
- [ ] Price display updates based on logged-in user role
- [ ] Prices are correctly formatted (₹X,XXX.XX)
- [ ] Form validation rejects invalid prices
- [ ] Price shows on product cards
- [ ] Price shows on product details page
- [ ] Order confirmation includes correct price
- [ ] Role names display correctly
- [ ] Responsive layout on mobile/tablet/desktop

### ⚠️ Backend Testing (TODO)
- [ ] Server validates user role from token
- [ ] API enforces Super Admin for price updates
- [ ] Order uses server-calculated price (not client price)
- [ ] Price audit logs created
- [ ] Unauthorized role-based access is denied

### 🔐 Security Testing (TODO)
- [ ] Cannot manipulate prices in browser console
- [ ] Cannot access other role's prices
- [ ] Cannot create orders with custom prices
- [ ] Non-Super Admin cannot update pricing
- [ ] Prices cannot be negative
- [ ] Price updates are validated

## Code Examples

### Using getPriceByRole()
```typescript
import { getPriceByRole, formatPrice } from "@/lib/pricingUtils";

const displayPrice = getPriceByRole(product, user?.role || null);
const formattedPrice = formatPrice(displayPrice);
// Output: ₹2,500.00
```

### In ProductForm (Super Admin Only)
```typescript
{isSuperAdmin && (
  <Card className="p-4 border-primary/50 bg-primary/5">
    <h3 className="font-semibold">Role-Based Pricing</h3>
    <Input
      label="Vendor Price"
      value={form.vendorPrice}
      onChange={(e) => setForm({ ...form, vendorPrice: e.target.value })}
    />
    {/* Similar for clientPrice and publicPrice */}
  </Card>
)}
```

### In Components
```typescript
import { useRbac } from "@/lib/rbac";
import { getPriceByRole, formatPrice } from "@/lib/pricingUtils";

const { user } = useRbac();
const displayPrice = getPriceByRole(product, user?.role || null);

<div>Price: {formatPrice(displayPrice)}</div>
```

## Files Modified/Created

### Created Files:
- ✅ `/src/lib/pricingUtils.ts` - Pricing utilities

### Updated Files:
- ✅ `/src/lib/productStore.ts` - Product interface with three prices
- ✅ `/src/app/components/products/ProductForm.tsx` - Super Admin pricing section
- ✅ `/src/app/components/products/ProductDetails.tsx` - Role-based price display
- ✅ `/src/app/pages/Products.tsx` - Price display on product cards
- ✅ `/src/app/pages/ProductDetailsPage.tsx` - Price in order confirmation

## Next Steps (Backend Implementation Required)

### 1. API Validation
```typescript
// On backend order creation
const userRole = req.user.role; // From JWT
const price = getPriceByRole(product, userRole);
// Never use client-sent price
order.totalPrice = price * quantity;
```

### 2. Database Auditing
```typescript
// Log all price modifications
auditLog.create({
  action: "UPDATE_PRODUCT_PRICES",
  user: req.user.id,
  product: productId,
  changes: {
    vendorPrice: oldPrice → newPrice,
    // etc.
  },
  timestamp: new Date(),
});
```

### 3. Role-Based Order Processing
```typescript
// Validate correct role-based price
const expectedPrice = getPriceByRoleFromServer(product, userRole);
if (order.requestedPrice !== expectedPrice) {
  throw new Error("Invalid price for user role");
}
```

## Price Strategy Examples

### Example 1: Tiered Pricing
- Public: ₹500 (highest markup)
- Client: ₹350 (discount)
- Vendor: ₹200 (wholesale)

### Example 2: Same Price Strategy
- Public: ₹1,000
- Client: ₹1,000
- Vendor: ₹1,000

### Example 3: Premium Strategy
- Public: ₹2,000
- Client: ₹1,500
- Vendor: ₹800

## Benefits

✅ **Flexible Pricing:**
- Different prices for different customer segments
- Easy to adjust margins
- Support multiple business models

✅ **Access Control:**
- Only Super Admin manages pricing
- Prevents accidental price changes
- Clear permission boundaries

✅ **Security:**
- Prices not exposed to unauthorized users
- Role-based access enforcement
- Audit trail capability

✅ **User Experience:**
- Users see their appropriate price
- No confusion about different tiers
- Consistent pricing across platform

✅ **Business Intelligence:**
- Track pricing by role
- Analyze margin by segment
- Monitor price modifications

## Troubleshooting

### Issue: Wrong price displaying
**Solution:** Check user role is set correctly in RBAC context
```typescript
const { user } = useRbac();
console.log(user?.role); // Should be 'super_admin', 'client', etc.
```

### Issue: Super Admin can't edit prices
**Solution:** Verify `canEditPrices()` returns true
```typescript
const isSuperAdmin = user?.role === "super_admin";
// Should be true for pricing section to render
```

### Issue: Price validation failing
**Solution:** Ensure all three prices are valid numbers
```typescript
const validation = validatePricing({
  vendorPrice: "100",    // Must be a string or number
  clientPrice: "200",    // Must be >= 0
  publicPrice: "300",    // Cannot be empty
});
```

### Issue: Incorrect price in order
**Solution:** Ensure correct role is being used
```typescript
const displayPrice = getPriceByRole(product, user?.role);
// user?.role might be null for unauthenticated users
```

## Performance Considerations

✅ **Optimized:**
- Price calculation is synchronous (no API calls)
- No additional database queries needed
- Formatting is cached when possible

⚠️ **To Monitor:**
- Validate pricing on large product imports
- Consider caching formatted prices
- Monitor role lookup performance

## Future Enhancements

1. **Automatic Price Updates:**
   - Scheduled price changes
   - Time-based pricing tiers
   - Seasonal adjustments

2. **Discount System:**
   - Bulk discounts
   - Loyalty discounts
   - Promotional pricing

3. **Advanced Analytics:**
   - Price sensitivity analysis
   - Revenue by role segment
   - Profit margin tracking

4. **Price History:**
   - Track price changes over time
   - Rollback capability
   - Version control for pricing

5. **Dynamic Pricing:**
   - AI-based price optimization
   - Competitor price monitoring
   - Demand-based pricing
