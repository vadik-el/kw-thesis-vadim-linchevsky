import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { QueryService } from '../../queryService';
import { VectorService } from '../../vectorService';
import { logger } from '../../../utils/logger';

// Zod schema for input validation
const DocumentSearchSchema = z.object({
  query: z.string().describe("Search query text"),
  document_type: z.enum(['bill_of_lading', 'contract', 'invoice', 'warehouse_release', 'certificate', 'all'])
    .default('all').describe("Type of document to search for"),
  category: z.enum(['Administrative', 'Financial', 'Legal', 'Operational', 'all'])
    .default('all').describe("Document category"),
  limit: z.number().default(10).describe("Maximum number of results")
});

export class DocumentSearchTool extends DynamicTool {
  private queryService: QueryService;
  private vectorService: VectorService;

  constructor() {
    super({
      name: "search_documents",
      description: "Search for documents by type, category, or content using semantic search. Returns REAL document data from the system database.",
      schema: DocumentSearchSchema,
      func: async (input) => {
        return await this.executeSearch(input);
      }
    });

    // Initialize real services
    this.queryService = new QueryService();
    this.vectorService = new VectorService();
  }

  private async executeSearch(args: any): Promise<string> {
    const { query, document_type, category, limit = 10 } = args;
    
    logger.info("🔍 DocumentSearchTool executing REAL search with:", { query, document_type, category, limit });

    try {
      // First, search in PostgreSQL for metadata
      const sqlResults = await this.queryService.searchDocuments({
        searchQuery: query,
        documentType: document_type !== 'all' ? document_type : undefined,
        category: category !== 'all' ? category : undefined,
        limit
      });

      // Then, perform semantic search in Qdrant
      const vectorResults = await this.vectorService.searchSimilarDocuments(query, limit);

      // Combine and deduplicate results
      const combinedResults = this.mergeSearchResults(sqlResults, vectorResults);

      if (combinedResults.length === 0) {
        return 'No documents found matching your search criteria.';
      }

      // Format results for LangChain agent
      const formattedResults = combinedResults.map((doc, idx) => 
        `${idx + 1}. **${doc.original_filename}**
   - Type: ${doc.document_type}
   - Category: ${doc.document_category}  
   - Quality: ${doc.quality_grade || 'N/A'}
   - Uploaded: ${new Date(doc.created_at).toLocaleDateString()}
   - Intelligence: ${doc.document_intelligence ? this.formatIntelligence(doc.document_intelligence) : 'Not processed'}`
      ).join('\n\n');

      logger.info(`✅ DocumentSearchTool found ${combinedResults.length} REAL documents`);
      return `Found ${combinedResults.length} documents:\n\n${formattedResults}`;

    } catch (error) {
      logger.error("❌ DocumentSearchTool error:", error);
      return `Error searching documents: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private mergeSearchResults(sqlResults: any[], vectorResults: any[]): any[] {
    const seen = new Set();
    const merged = [];

    for (const doc of sqlResults) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        merged.push(doc);
      }
    }

    for (const doc of vectorResults) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        merged.push(doc);
      }
    }

    return merged;
  }

  private formatIntelligence(intelligence: any): string {
    if (!intelligence) return 'Not processed';
    
    // Format intelligence data for readability
    const formatted = JSON.stringify(intelligence, null, 2);
    return formatted.length > 200 ? formatted.substring(0, 200) + '...' : formatted;
  }
}