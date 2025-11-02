#!/usr/bin/env node
import { generateAPIKey, generateJWT } from '../middleware/auth';
import { logger } from '../../utils/logger';

/**
 * Utility script to generate API keys and JWT tokens
 * Usage:
 *   npm run generate:key
 *   npm run generate:jwt
 */

const args = process.argv.slice(2);
const command = args[0] || 'api-key';

switch (command) {
  case 'api-key':
    const apiKey = generateAPIKey();
    console.log('\n🔑 Generated API Key:');
    console.log('━'.repeat(60));
    console.log(apiKey);
    console.log('━'.repeat(60));
    console.log('\n📝 Add this to your .env file:');
    console.log(`MCP_API_KEYS="${apiKey}"`);
    console.log('\n💡 Or add multiple keys (comma-separated):');
    console.log(`MCP_API_KEYS="key1,key2,key3"`);
    console.log('\n');
    break;

  case 'jwt':
    const userId = args[1] || 'user-123';
    const email = args[2] || 'user@example.com';

    const token = generateJWT({
      id: userId,
      email: email,
      permissions: ['vessel:track', 'documents:search', 'trades:query'],
    });

    console.log('\n🎫 Generated JWT Token:');
    console.log('━'.repeat(60));
    console.log(token);
    console.log('━'.repeat(60));
    console.log(`\n👤 User: ${userId}`);
    console.log(`📧 Email: ${email}`);
    console.log('⏰ Expires: 7 days');
    console.log('\n💡 Use in Authorization header:');
    console.log(`Authorization: Bearer ${token}`);
    console.log('\n');
    break;

  default:
    console.log('Usage:');
    console.log('  tsx src/mcp-server/scripts/generate-api-key.ts api-key');
    console.log('  tsx src/mcp-server/scripts/generate-api-key.ts jwt <userId> <email>');
}
