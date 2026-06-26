import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const STUDENT_UNIFORM_SHIRT_BASE_NAME = "Student Uniform Shirt";
export const STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE = "uniform_shirt";
export const STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE = "uniform_shirt_bundle";
export const STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES = [
  STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
  STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE,
] as const;
export const STUDENT_UNIFORM_SHIRT_CATALOG = "student_uniform_shirt";
export const STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS = 1800;
export const STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS = 8000;
export const STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT = 5;
export const STUDENT_UNIFORM_SHIRT_DEFAULT_PRICE_CENTS = STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS;

export const STUDENT_UNIFORM_SHIRT_COLORS = ["Black", "Yellow"] as const;
export const STUDENT_UNIFORM_SHIRT_SIZES = ["2T", "3T", "4T", "5T", "6T", "Youth Small"] as const;

export type StudentUniformShirtColor = typeof STUDENT_UNIFORM_SHIRT_COLORS[number];
export type StudentUniformShirtSize = typeof STUDENT_UNIFORM_SHIRT_SIZES[number];
export type StudentUniformPurchaseOption = "single" | "bundle_5";

export type ProductLike = {
  id: string;
  name: string;
  type: string;
  amountCents: number;
};

export type StudentUniformProductOption = {
  id: string;
  productId: string;
  name: string;
  type: typeof STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES[number];
  amountCents: number;
  color: StudentUniformShirtColor;
  size: StudentUniformShirtSize;
  purchaseOption: StudentUniformPurchaseOption;
  shirtCount: number;
};

type ProductDelegate = {
  findFirst(args: {
    where: Prisma.ProductWhereInput;
    select: { id: true; name: true; type: true; amountCents: true };
  }): Promise<ProductLike | null>;
  create(args: {
    data: Prisma.ProductCreateInput;
    select: { id: true; name: true; type: true; amountCents: true };
  }): Promise<ProductLike>;
  update(args: {
    where: { id: string };
    data: Prisma.ProductUpdateInput;
    select: { id: true; name: true; type: true; amountCents: true };
  }): Promise<ProductLike>;
};

type ProductClient = {
  product: ProductDelegate;
};

function normalizedSinglePriceCents() {
  const configured = Number.parseInt(process.env.STUDENT_UNIFORM_SHIRT_PRICE_CENTS || "", 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS;
}

function normalizedBundlePriceCents() {
  const configured = Number.parseInt(process.env.STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS || "", 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS;
}

export function studentUniformShirtProductName(color: StudentUniformShirtColor, size: StudentUniformShirtSize) {
  return `${STUDENT_UNIFORM_SHIRT_BASE_NAME} - ${color} - ${size}`;
}

export function studentUniformShirtBundleProductName(color: StudentUniformShirtColor, size: StudentUniformShirtSize) {
  return `${STUDENT_UNIFORM_SHIRT_BASE_NAME} 5-Pack - ${color} - ${size}`;
}

export function studentUniformShirtSingleDefinitions(amountCents = normalizedSinglePriceCents()) {
  return STUDENT_UNIFORM_SHIRT_COLORS.flatMap((color) =>
    STUDENT_UNIFORM_SHIRT_SIZES.map((size) => ({
      name: studentUniformShirtProductName(color, size),
      type: STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
      amountCents,
      color,
      size,
      purchaseOption: "single" as const,
      shirtCount: 1,
    })),
  );
}

export function studentUniformShirtBundleDefinitions(amountCents = normalizedBundlePriceCents()) {
  return STUDENT_UNIFORM_SHIRT_COLORS.flatMap((color) =>
    STUDENT_UNIFORM_SHIRT_SIZES.map((size) => ({
      name: studentUniformShirtBundleProductName(color, size),
      type: STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE,
      amountCents,
      color,
      size,
      purchaseOption: "bundle_5" as const,
      shirtCount: STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT,
    })),
  );
}

export function studentUniformShirtDefinitions(
  singleAmountCents = normalizedSinglePriceCents(),
  bundleAmountCents = normalizedBundlePriceCents(),
) {
  return [
    ...studentUniformShirtSingleDefinitions(singleAmountCents),
    ...studentUniformShirtBundleDefinitions(bundleAmountCents),
  ];
}

export function studentUniformShirtVariantFromProduct(product: ProductLike | null | undefined) {
  if (!product || !STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES.includes(product.type as typeof STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES[number])) return null;
  for (const definition of studentUniformShirtDefinitions()) {
    if (definition.name === product.name) {
      return {
        catalog: STUDENT_UNIFORM_SHIRT_CATALOG,
        color: definition.color,
        size: definition.size,
        purchaseOption: definition.purchaseOption,
        shirtCount: definition.shirtCount,
      };
    }
  }
  return null;
}

export function studentUniformProductOptions(products: ProductLike[]): StudentUniformProductOption[] {
  return products
    .map((product) => {
      const variant = studentUniformShirtVariantFromProduct(product);
      if (!variant) return null;
      return {
        id: product.id,
        productId: product.id,
        name: product.name,
        type: product.type as typeof STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES[number],
        amountCents: product.amountCents,
        color: variant.color,
        size: variant.size,
        purchaseOption: variant.purchaseOption,
        shirtCount: variant.shirtCount,
      };
    })
    .filter((product): product is StudentUniformProductOption => Boolean(product))
    .sort((left, right) => {
      const colorSort = STUDENT_UNIFORM_SHIRT_COLORS.indexOf(left.color) - STUDENT_UNIFORM_SHIRT_COLORS.indexOf(right.color);
      if (colorSort) return colorSort;
      const sizeSort = STUDENT_UNIFORM_SHIRT_SIZES.indexOf(left.size) - STUDENT_UNIFORM_SHIRT_SIZES.indexOf(right.size);
      if (sizeSort) return sizeSort;
      return left.purchaseOption === right.purchaseOption ? 0 : left.purchaseOption === "single" ? -1 : 1;
    });
}

export async function ensureStudentUniformShirtProducts(client: ProductClient = prisma) {
  const definitions = studentUniformShirtDefinitions();
  const products: ProductLike[] = [];
  let created = 0;
  let updated = 0;
  let existing = 0;

  for (const definition of definitions) {
    const current = await client.product.findFirst({
      where: { name: definition.name, type: definition.type },
      select: { id: true, name: true, type: true, amountCents: true },
    });
    if (current) {
      if (current.amountCents !== definition.amountCents) {
        const updatedProduct = await client.product.update({
          where: { id: current.id },
          data: { amountCents: definition.amountCents },
          select: { id: true, name: true, type: true, amountCents: true },
        });
        updated += 1;
        products.push(updatedProduct);
        continue;
      }
      existing += 1;
      products.push(current);
      continue;
    }

    const product = await client.product.create({
      data: {
        name: definition.name,
        type: definition.type,
        amountCents: definition.amountCents,
      },
      select: { id: true, name: true, type: true, amountCents: true },
    });
    created += 1;
    products.push(product);
  }

  return { created, updated, existing, products };
}
