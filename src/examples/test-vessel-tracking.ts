#!/usr/bin/env tsx

/**
 * Vessel Tracking Agent Test Example
 * 
 * This file demonstrates how to use the LangChain vessel tracking agent
 * with various configurations and scenarios for thesis research.
 */

import dotenv from 'dotenv';
import { CloverReActAgent, CloverAgentConfig } from '../services/langchain/CloverReActAgent';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Test Basic Agent Functionality
 */
async function testBasicAgent() {
  console.log('\n=== Testing Basic Agent Functionality ===\n');
  
  try {
    const agent = new CloverReActAgent({ persona: 'admin' });
    const result = await agent.processMessage('Hello! Can you help me understand your capabilities?');
    
    console.log('✅ Basic Agent Test Success');
    console.log('Response:', result.output);
    console.log('Tools Available:', agent.getAvailableTools());
    
  } catch (error) {
    console.error('❌ Basic Agent Test Failed:', error);
  }
}

/**
 * Test Extended Thinking Functionality
 */
async function testExtendedThinking() {
  console.log('\n=== Testing Extended Thinking ===\n');
  
  try {
    const agent = new CloverReActAgent({
      persona: 'finance',
      extendedThinking: {
        enabled: true,
        budgetTokens: 8000
      }
    });
    
    const complexQuery = `
      Analyze the potential financial impact of a 7-day delay in copper shipments 
      arriving at Long Beach port, considering current market conditions and 
      typical margin structures in commodity trading.
    `;
    
    console.log('🧠 Starting Extended Thinking analysis...');
    console.log('Query:', complexQuery);
    
    const startTime = Date.now();
    const result = await agent.processMessage(complexQuery);
    const endTime = Date.now();
    
    console.log('✅ Extended Thinking Test Success');
    console.log('Processing time:', (endTime - startTime) / 1000, 'seconds');
    console.log('Response:', result.output);
    console.log('Tools used:', result.toolsUsed);
    
  } catch (error) {
    console.error('❌ Extended Thinking Test Failed:', error);
  }
}

/**
 * Test Vessel Tracking Tool
 */
async function testVesselTracking() {
  console.log('\n=== Testing Vessel Tracking Tool ===\n');
  
  try {
    const agent = new CloverReActAgent({ persona: 'operations' });
    
    // Test with a sample B/L number (this will attempt real API call)
    const vesselQuery = 'Track vessel for B/L number MSKU123456789';
    
    console.log('🚢 Testing vessel tracking...');
    console.log('Query:', vesselQuery);
    
    const result = await agent.processMessage(vesselQuery);
    
    console.log('✅ Vessel Tracking Test Completed');
    console.log('Response:', result.output);
    console.log('Tools used:', result.toolsUsed);
    
  } catch (error) {
    console.error('❌ Vessel Tracking Test Failed:', error);
    
    // If Terminal49 API is not configured, this is expected
    if (error.message?.includes('API key') || error.message?.includes('Terminal49')) {
      console.log('ℹ️ Note: This test requires Terminal49 API configuration.');
      console.log('   See SETUP.md for Terminal49 API setup instructions.');
    }
  }
}

/**
 * Test Different Personas
 */
async function testPersonas() {
  console.log('\n=== Testing Different Personas ===\n');
  
  const personas: Array<CloverAgentConfig['persona']> = ['admin', 'management', 'finance', 'operations', 'risk'];
  const query = 'What should I know about supply chain risk management?';
  
  for (const persona of personas) {
    try {
      console.log(`\n--- Testing ${persona.toUpperCase()} Persona ---`);
      
      const agent = new CloverReActAgent({ 
        persona,
        temperature: 0.7
      });
      
      const result = await agent.processMessage(query);
      
      console.log(`✅ ${persona} persona test success`);
      console.log('Response preview:', result.output.substring(0, 200) + '...');
      
    } catch (error) {
      console.error(`❌ ${persona} persona test failed:`, error.message);
    }
  }
}

/**
 * Test Streaming Response
 */
async function testStreamingResponse() {
  console.log('\n=== Testing Streaming Response ===\n');
  
  try {
    const agent = new CloverReActAgent({
      persona: 'risk',
      extendedThinking: { enabled: true, budgetTokens: 5000 }
    });
    
    const streamQuery = 'Analyze the risk factors in maritime shipping for Q4 2024';
    
    console.log('📡 Starting streaming response...');
    console.log('Query:', streamQuery);
    
    const stream = await agent.streamMessage(streamQuery);
    
    return new Promise<void>((resolve, reject) => {
      let chunks = 0;
      
      stream.on('data', (chunk) => {
        chunks++;
        const data = chunk.toString();
        
        // Parse SSE format
        if (data.startsWith('data: ')) {
          const jsonStr = data.slice(6);
          if (jsonStr.trim() === '[DONE]') {
            console.log('\n✅ Streaming test completed');
            console.log('Total chunks received:', chunks);
            resolve();
            return;
          }
          
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'text') {
              process.stdout.write('.');
            }
          } catch (e) {
            // Ignore parsing errors for non-JSON chunks
          }
        }
      });
      
      stream.on('end', () => {
        console.log('\n✅ Stream ended successfully');
        resolve();
      });
      
      stream.on('error', (error) => {
        console.error('❌ Stream error:', error);
        reject(error);
      });
      
      // Timeout after 60 seconds
      setTimeout(() => {
        console.log('\n⏱️ Stream timeout');
        resolve();
      }, 60000);
    });
    
  } catch (error) {
    console.error('❌ Streaming Test Failed:', error);
  }
}

/**
 * Test Multi-Tool Coordination
 */
async function testMultiToolCoordination() {
  console.log('\n=== Testing Multi-Tool Coordination ===\n');
  
  try {
    const agent = new CloverReActAgent({
      persona: 'management',
      extendedThinking: { enabled: true, budgetTokens: 10000 }
    });
    
    const complexQuery = `
      I need a comprehensive analysis of our shipping operations:
      1. Track any vessels currently carrying our cargo
      2. Identify any potential risks or delays
      3. Provide a financial summary of impacts
      4. Suggest operational improvements
    `;
    
    console.log('🔄 Testing multi-tool coordination...');
    console.log('Query:', complexQuery);
    
    const startTime = Date.now();
    const result = await agent.processMessage(complexQuery);
    const endTime = Date.now();
    
    console.log('✅ Multi-Tool Coordination Test Success');
    console.log('Processing time:', (endTime - startTime) / 1000, 'seconds');
    console.log('Tools used:', result.toolsUsed);
    console.log('Response preview:', result.output.substring(0, 300) + '...');
    
  } catch (error) {
    console.error('❌ Multi-Tool Coordination Test Failed:', error);
  }
}

/**
 * Performance Benchmark Test
 */
async function performanceBenchmark() {
  console.log('\n=== Performance Benchmark ===\n');
  
  const testCases = [
    { query: 'Hello', expectedTime: 2000, description: 'Simple greeting' },
    { query: 'What are the available tools?', expectedTime: 3000, description: 'Tool listing' },
    { query: 'Track vessel ABC123', expectedTime: 8000, description: 'Vessel tracking' },
    { 
      query: 'Analyze the financial risk of shipping delays in copper trading', 
      expectedTime: 15000, 
      description: 'Complex analysis with Extended Thinking' 
    }
  ];
  
  const agent = new CloverReActAgent({
    persona: 'finance',
    extendedThinking: { enabled: true, budgetTokens: 5000 }
  });
  
  for (const testCase of testCases) {
    try {
      console.log(`\n--- ${testCase.description} ---`);
      
      const startTime = Date.now();
      const result = await agent.processMessage(testCase.query);
      const endTime = Date.now();
      
      const actualTime = endTime - startTime;
      const performance = actualTime <= testCase.expectedTime ? '✅' : '⚠️';
      
      console.log(`${performance} Time: ${actualTime}ms (expected: <${testCase.expectedTime}ms)`);
      console.log('Tools used:', result.toolsUsed.join(', ') || 'none');
      
    } catch (error) {
      console.error('❌ Benchmark test failed:', error.message);
    }
  }
}

/**
 * Error Handling Test
 */
async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===\n');
  
  try {
    const agent = new CloverReActAgent({ persona: 'admin' });
    
    // Test with invalid input
    console.log('Testing with malformed query...');
    const result1 = await agent.processMessage('Track vessel for B/L: '); // Empty B/L
    console.log('✅ Handled empty B/L gracefully');
    
    // Test with very long query
    console.log('Testing with very long query...');
    const longQuery = 'Track vessel '.repeat(1000);
    const result2 = await agent.processMessage(longQuery);
    console.log('✅ Handled long query gracefully');
    
  } catch (error) {
    console.error('❌ Error handling test issues:', error);
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting LangChain Vessel Tracking Agent Tests\n');
  console.log('Environment check:');
  console.log('- Node.js version:', process.version);
  console.log('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('- Terminal49 API key:', process.env.TERMINAL49_API_KEY ? '✅ Set' : '⚠️ Optional');
  
  const tests = [
    { name: 'Basic Agent', fn: testBasicAgent },
    { name: 'Extended Thinking', fn: testExtendedThinking },
    { name: 'Vessel Tracking', fn: testVesselTracking },
    { name: 'Personas', fn: testPersonas },
    { name: 'Streaming Response', fn: testStreamingResponse },
    { name: 'Multi-Tool Coordination', fn: testMultiToolCoordination },
    { name: 'Performance Benchmark', fn: performanceBenchmark },
    { name: 'Error Handling', fn: testErrorHandling }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${test.name}`);
      console.log(`${'='.repeat(60)}`);
      
      await test.fn();
      passed++;
      
    } catch (error) {
      console.error(`\n❌ Test '${test.name}' failed:`, error);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('🏁 Test Results Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The system is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the error messages above.');
    console.log('   Common issues:');
    console.log('   - Missing API keys (check .env file)');
    console.log('   - Network connectivity issues');
    console.log('   - Database not configured (optional features)');
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all tests
  runAllTests().catch(console.error);
} else {
  // Run specific test
  const testName = args[0].toLowerCase();
  const testMap: Record<string, () => Promise<void>> = {
    'basic': testBasicAgent,
    'thinking': testExtendedThinking,
    'vessel': testVesselTracking,
    'personas': testPersonas,
    'stream': testStreamingResponse,
    'multi': testMultiToolCoordination,
    'performance': performanceBenchmark,
    'error': testErrorHandling
  };
  
  if (testMap[testName]) {
    testMap[testName]().catch(console.error);
  } else {
    console.log('Available tests:', Object.keys(testMap).join(', '));
    console.log('Usage: npm test [test-name]');
    console.log('Or: npm test (to run all tests)');
  }
}