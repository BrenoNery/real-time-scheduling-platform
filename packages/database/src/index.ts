export const DATABASE_PACKAGE_NAME = "@repo/database" as const;

export function getDatabasePackageName(): typeof DATABASE_PACKAGE_NAME {
  return DATABASE_PACKAGE_NAME;
}
