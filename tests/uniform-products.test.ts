import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STUDENT_UNIFORM_SHIRT_COLORS,
  STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE,
  STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
  STUDENT_UNIFORM_SHIRT_SIZES,
  studentUniformProductOptions,
  studentUniformShirtDefinitions,
  studentUniformShirtVariantFromProduct,
} from "@/lib/uniform-products";
import {
  invoiceProductCheckoutBranding,
  invoiceProductStripeMetadata,
  invoicePurposeLabel,
  productInvoiceFieldsForProduct,
  productPurchaseTotals,
} from "@/lib/product-billing";

test("student uniform shirt catalog creates every color and size variant", () => {
  const definitions = studentUniformShirtDefinitions(1800, 8000);

  assert.equal(definitions.length, STUDENT_UNIFORM_SHIRT_COLORS.length * STUDENT_UNIFORM_SHIRT_SIZES.length * 2);
  assert.deepEqual(
    definitions.map((definition) => definition.name).slice(0, 3),
    [
      "Student Uniform Shirt - Black - 2T",
      "Student Uniform Shirt - Black - 3T",
      "Student Uniform Shirt - Black - 4T",
    ],
  );
  assert.equal(definitions.filter((definition) => definition.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE).length, 12);
  assert.equal(definitions.filter((definition) => definition.type === STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE).length, 12);
  assert.equal(definitions.find((definition) => definition.purchaseOption === "single")?.amountCents, 1800);
  assert.equal(definitions.find((definition) => definition.purchaseOption === "bundle_5")?.amountCents, 8000);
});

test("student uniform shirt products resolve to portal options", () => {
  const products = [
    { id: "yellow-youth", name: "Student Uniform Shirt - Yellow - Youth Small", type: STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE, amountCents: 1800 },
    { id: "other", name: "Registration Fee", type: "fee", amountCents: 5000 },
    { id: "black-2t", name: "Student Uniform Shirt - Black - 2T", type: STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE, amountCents: 1800 },
    { id: "black-2t-pack", name: "Student Uniform Shirt 5-Pack - Black - 2T", type: STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE, amountCents: 8000 },
  ];

  assert.deepEqual(studentUniformShirtVariantFromProduct(products[0]), {
    catalog: "student_uniform_shirt",
    color: "Yellow",
    size: "Youth Small",
    purchaseOption: "single",
    shirtCount: 1,
  });

  const options = studentUniformProductOptions(products);
  assert.deepEqual(options.map((option) => option.productId), ["black-2t", "black-2t-pack", "yellow-youth"]);
  assert.deepEqual(options.map((option) => option.purchaseOption), ["single", "bundle_5", "single"]);
});

test("product billing metadata labels checkout and receipts as product purchases", () => {
  const product = {
    id: "prod_black_2t",
    name: "Student Uniform Shirt - Black - 2T",
    type: STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
    amountCents: 1800,
  };
  const fields = productInvoiceFieldsForProduct(product, 8);
  const totals = productPurchaseTotals(product, 8);

  assert.deepEqual(totals, { selectedQuantity: 8, receiptQuantity: 8, totalCents: 14400 });
  assert.equal(fields.checkoutPurpose, "product_purchase");
  assert.equal(fields.productColor, "Black");
  assert.equal(fields.productSize, "2T");
  assert.equal(fields.productPurchaseOption, "single");
  assert.equal(fields.quantity, 8);
  assert.equal(fields.itemSummary, "Student Uniform Shirt - Black - 2T x 8");
  assert.equal(invoicePurposeLabel(fields), "Student Uniform Shirt - Black - 2T x 8");

  const branding = invoiceProductCheckoutBranding({
    invoiceNumber: "INV-1",
    familyName: "Bailey Family",
    customFields: fields,
    items: [{ description: "fallback" }],
  });
  assert.equal(branding?.paymentDescription, "Student Uniform Shirt - Black - 2T x 8 for Bailey Family");

  assert.deepEqual(invoiceProductStripeMetadata({ ...fields, purchaseId: "purchase_1" }), {
    checkoutPurpose: "product_purchase",
    receiptKind: "product",
    chargeSource: "product",
    sourceId: "prod_black_2t",
    productId: "prod_black_2t",
    productName: "Student Uniform Shirt - Black - 2T",
    productType: STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
    productCatalog: "student_uniform_shirt",
    productColor: "Black",
    productSize: "2T",
    productPurchaseOption: "single",
    itemSummary: "Student Uniform Shirt - Black - 2T x 8",
    purchaseId: "purchase_1",
    quantity: "8",
  });
});

test("uniform shirt 5-pack metadata preserves bundle pricing and quantity", () => {
  const product = {
    id: "prod_black_2t_bundle",
    name: "Student Uniform Shirt 5-Pack - Black - 2T",
    type: STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE,
    amountCents: 8000,
  };
  const fields = productInvoiceFieldsForProduct(product, 2);
  const totals = productPurchaseTotals(product, 2);

  assert.deepEqual(totals, { selectedQuantity: 2, receiptQuantity: 10, totalCents: 16000 });
  assert.equal(fields.productPurchaseOption, "bundle_5");
  assert.equal(fields.quantity, 10);
  assert.equal(fields.itemSummary, "Student Uniform Shirt 5-Pack - Black - 2T x 2");
  assert.equal(invoicePurposeLabel(fields), "Student Uniform Shirt 5-Pack - Black - 2T x 2");
  assert.equal(invoiceProductStripeMetadata(fields).quantity, "10");
  assert.equal(invoiceProductStripeMetadata(fields).productPurchaseOption, "bundle_5");
});
