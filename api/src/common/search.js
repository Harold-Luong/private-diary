// Treat SQL LIKE wildcard characters as literal search text.
export const literalLike = (value) => value.replace(/[\\%_]/g, '\\$&');
