import "./load-env";
import { ensureStudentUniformShirtProducts } from "@/lib/uniform-products";

async function main() {
  const result = await ensureStudentUniformShirtProducts();
  console.log(`Student uniform shirt products ready: ${result.created} created, ${result.updated} updated, ${result.existing} already existed.`);
  for (const product of result.products) {
    console.log(`${product.name} - $${(product.amountCents / 100).toFixed(2)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
