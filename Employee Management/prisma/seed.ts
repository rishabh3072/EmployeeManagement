import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { isEmail } from 'class-validator';
import { admin } from './seeds';

const program = new Command();
program.option('--seed-only <name>', 'Specify a seed name').parse(process.argv);

const prisma = new PrismaClient();

async function main() {

  await prisma.taxSlab.createMany({
    data: [
      { minIncome: 0, maxIncome: 250000, taxRate: 0, description: 'No Tax' },
      { minIncome: 250001, maxIncome: 500000, taxRate: 5, description: '5% Tax' },
      { minIncome: 500001, maxIncome: 1000000, taxRate: 10, description: '10% Tax' },
      { minIncome: 1000001, maxIncome: null, taxRate: 20, description: '20% Tax' },
    ],
    skipDuplicates: true, // Optional: skips if already exists
  });

  const options = program.opts();

  // Seed admin default credential
  if (!options.seedOnly || options.seedOnly === 'admin') {
    if (await prisma.admin.count()) {
      console.log('⚠ Skipping seed for `admin`, due to non-empty table');
    } else {
      if (
        isEmail(admin.email) &&
        admin.meta?.create?.passwordHash &&
        admin.meta.create.passwordSalt
      ) {
        await prisma.admin.create({
          data: admin,
        });
      } else {
        console.error(new Error('Invalid default admin credentials found'));
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
