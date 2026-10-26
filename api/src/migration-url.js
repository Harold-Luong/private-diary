// Prisma migrations need a session that is not shared by the Neon pooler.
export function migrationUrl(url) {
    let hostname;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new Error('Invalid migration database URL. Check DATABASE_URL_UNPOOLED or DATABASE_URL.');
    }
    if (hostname.endsWith('.neon.tech') && hostname.split('.')[0].endsWith('-pooler')) {
        throw new Error('Prisma migrations require a direct Neon connection. Set DATABASE_URL_UNPOOLED to the URL from Neon Connect with connection pooling disabled (hostname without -pooler). Keep DATABASE_URL pooled for the API.');
    }
    return url;
}
