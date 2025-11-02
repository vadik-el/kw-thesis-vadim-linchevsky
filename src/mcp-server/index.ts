#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { TrackVesselTool } from '../services/langchain/tools/TrackVesselTool';
import { DocumentSearchTool } from '../services/langchain/tools/DocumentSearchTool';
import { QueryTradesTool } from '../services/langchain/tools/QueryTradesTool';
import { GetDashboardTool } from '../services/langchain/tools/GetDashboardTool';
import { AnalyzeRiskTool } from '../services/langchain/tools/AnalyzeRiskTool';
import { GetFinancialSummaryTool } from '../services/langchain/tools/GetFinancialSummaryTool';
import { authenticateRequest } from './middleware/auth';

dotenv.config();

/**
 * MCP Server for Vessel Tracking Agent
 * Exposes vessel tracking and maritime analytics tools via Model Context Protocol
 *
 * Supports two transport modes:
 * 1. stdio - For local MCP clients (Claude Desktop, IDE extensions)
 * 2. SSE over HTTP - For remote access (deployed on servers)
 */
class VesselTrackingMCPServer {
  private server: Server;
  private tools: Map<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: 'vessel-tracking-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tools = new Map();
    this.initializeTools();
    this.setupHandlers();

    logger.info('🚢 Vessel Tracking MCP Server initialized');
  }

  /**
   * Initialize all available tools
   */
  private initializeTools(): void {
    const toolInstances = [
      new TrackVesselTool(),
      new DocumentSearchTool(),
      new QueryTradesTool(),
      new GetDashboardTool(),
      new AnalyzeRiskTool(),
      new GetFinancialSummaryTool(),
    ];

    for (const tool of toolInstances) {
      this.tools.set(tool.name, tool);
      logger.info(`✅ Registered tool: ${tool.name}`);
    }
  }

  /**
   * Convert LangChain tool schema to MCP tool format
   */
  private convertToMCPTool(toolName: string, tool: any): Tool {
    return {
      name: toolName,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.convertZodToJSONSchema(tool.schema),
        required: this.getRequiredFields(tool.schema),
      },
    };
  }

  /**
   * Convert Zod schema to JSON Schema for MCP
   */
  private convertZodToJSONSchema(schema: z.ZodObject<any>): any {
    const shape = schema._def.shape();
    const properties: any = {};

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      properties[key] = {
        type: this.getJSONSchemaType(zodType),
        description: zodType.description || '',
      };
    }

    return properties;
  }

  /**
   * Get JSON Schema type from Zod type
   */
  private getJSONSchemaType(zodType: z.ZodTypeAny): string {
    if (zodType instanceof z.ZodString) return 'string';
    if (zodType instanceof z.ZodNumber) return 'number';
    if (zodType instanceof z.ZodBoolean) return 'boolean';
    if (zodType instanceof z.ZodArray) return 'array';
    if (zodType instanceof z.ZodObject) return 'object';
    return 'string';
  }

  /**
   * Get required fields from Zod schema
   */
  private getRequiredFields(schema: z.ZodObject<any>): string[] {
    const shape = schema._def.shape();
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodType = value as z.ZodTypeAny;
      if (!zodType.isOptional()) {
        required.push(key);
      }
    }

    return required;
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [];

      for (const [name, tool] of this.tools) {
        tools.push(this.convertToMCPTool(name, tool));
      }

      return { tools };
    });

    // Call a tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info(`🔧 Tool called: ${name}`, { args });

      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      try {
        // Validate input against schema
        tool.schema.parse(args);

        // Execute the tool
        const result = await tool.func(args);

        logger.info(`✅ Tool ${name} completed successfully`);

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        logger.error(`❌ Tool ${name} failed:`, error);

        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start server in stdio mode (for local MCP clients)
   */
  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('🎯 MCP Server running in stdio mode');
  }

  /**
   * Start server in HTTP/SSE mode (for remote access)
   */
  async startHTTP(port: number = 3000): Promise<void> {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', server: 'vessel-tracking-mcp' });
    });

    // MCP endpoint with authentication
    app.get('/mcp', authenticateRequest, async (req, res) => {
      logger.info('📡 New MCP SSE connection');

      const transport = new SSEServerTransport('/message', res);
      await this.server.connect(transport);
    });

    // Message endpoint for SSE
    app.post('/mcp/message', authenticateRequest, async (req, res) => {
      // Handle MCP messages
      res.json({ received: true });
    });

    app.listen(port, () => {
      logger.info(`🚀 MCP Server listening on http://0.0.0.0:${port}/mcp`);
      logger.info(`📊 Health check available at http://0.0.0.0:${port}/health`);
    });
  }

  /**
   * Get the server instance
   */
  getServer(): Server {
    return this.server;
  }
}

// Main entry point
async function main() {
  const mode = process.env.MCP_TRANSPORT_MODE || 'stdio';
  const port = parseInt(process.env.MCP_PORT || '3000');

  const mcpServer = new VesselTrackingMCPServer();

  if (mode === 'http') {
    await mcpServer.startHTTP(port);
  } else {
    await mcpServer.startStdio();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Shutting down MCP server...');
  process.exit(0);
});

main().catch((error) => {
  logger.error('❌ Fatal error:', error);
  process.exit(1);
});

export { VesselTrackingMCPServer };
