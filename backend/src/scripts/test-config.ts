/** Test credentials must be supplied by the isolated test environment. */
export function requiredTestCredential(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}; provide it through the test environment`);
  }
  return value;
}

export const testOwnerUsername = process.env.TEST_OWNER_USERNAME || 'owner';
