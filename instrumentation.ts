// Force-load .env.local with override=true so dotenvx or other shell tools
// that pre-set variables as empty strings don't block the real values.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'test') {
    const path = await import('path');
    const { config } = await import('dotenv');
    config({ path: path.join(process.cwd(), '.env.local'), override: true });
  }
}
