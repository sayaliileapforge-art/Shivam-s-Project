import { Role } from "./rbac";
import { Product } from "./productStore";

/**
 * Maps user roles to pricing tiers
 * - Vendor/Master Vendor/Sub Vendor/Sales Person → vendorPrice
 * - Client → clientPrice
 * - Others/Public/Unauthenticated → publicPrice
 */
export function getPriceByRole(product: Product, userRole: Role | null): number {
  if (!userRole) {
    // Unauthenticated user → public price
    return product.publicPrice || 0;
  }

  const VENDOR_ROLES = [
    "master_vendor",
    "sub_vendor",
    "sales_person",
    "designer_staff",
    "data_operator",
    "production_manager",
    "accounts_manager",
  ];

  if (VENDOR_ROLES.includes(userRole)) {
    return product.vendorPrice || 0;
  }

  if (userRole === "client") {
    return product.clientPrice || 0;
  }

  // Super Admin sees vendor price (business cost)
  if (userRole === "super_admin") {
    return product.vendorPrice || 0;
  }

  // Fallback to public price
  return product.publicPrice || 0;
}

/**
 * Validates if a price is a valid positive number
 */
export function isValidPrice(price: any): boolean {
  const num = parseFloat(price);
  return !isNaN(num) && num >= 0;
}

/**
 * Formats price for display
 */
export function formatPrice(price: number, currency: string = "₹"): string {
  return `${currency}${price.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Calculates discount percentage between two prices
 */
export function calculateDiscount(originalPrice: number, salePrice: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
}

/**
 * Gets all prices as an object
 */
export interface PricingTier {
  vendorPrice: number;
  clientPrice: number;
  publicPrice: number;
}

export function extractPricing(product: Product): PricingTier {
  return {
    vendorPrice: product.vendorPrice || 0,
    clientPrice: product.clientPrice || 0,
    publicPrice: product.publicPrice || 0,
  };
}

/**
 * Validates all three prices
 */
export function validatePricing(pricing: {
  vendorPrice: any;
  clientPrice: any;
  publicPrice: any;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!isValidPrice(pricing.vendorPrice)) {
    errors.vendorPrice = "Vendor price must be a valid number";
  }
  if (!isValidPrice(pricing.clientPrice)) {
    errors.clientPrice = "Client price must be a valid number";
  }
  if (!isValidPrice(pricing.publicPrice)) {
    errors.publicPrice = "Public price must be a valid number";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Determines if user can edit prices (Super Admin only)
 */
export function canEditPrices(userRole: Role | null): boolean {
  return userRole === "super_admin";
}

/**
 * Gets user-friendly role name for pricing display
 */
export function getRoleDisplayName(userRole: Role | null): string {
  if (!userRole) return "Public";
  if (userRole === "client") return "Client";
  if (userRole === "super_admin") return "Admin";
  return "Vendor";
}
