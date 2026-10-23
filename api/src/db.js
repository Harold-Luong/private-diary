import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
export { Prisma };
export const createDb = (url)=>new PrismaClient({
        adapter: new PrismaPg({
            connectionString: url
        })
    });
