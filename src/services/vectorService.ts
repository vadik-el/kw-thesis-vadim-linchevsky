import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export class VectorService {
  private qdrantClient: QdrantClient;
  private openai: OpenAI;
  private collectionName: string;

  constructor() {
    // Initialize Qdrant client
    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });

    // Initialize OpenAI for embeddings (or use Claude embeddings if available)
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    this.collectionName = process.env.QDRANT_COLLECTION || 'clarity_documents';
  }

  /**
   * Check if Qdrant is connected and collection exists
   */
  async checkConnection(): Promise<boolean> {
    try {
      const collections = await this.qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        logger.warn(`Qdrant collection ${this.collectionName} does not exist`);
        // Optionally create the collection
        await this.createCollection();
      }

      return true;
    } catch (error) {
      logger.error('Qdrant connection error:', error);
      return false;
    }
  }

  /**
   * Create the vector collection if it doesn't exist
   */
  private async createCollection(): Promise<void> {
    try {
      await this.qdrantClient.createCollection(this.collectionName, {
        vectors: {
          size: 1536, // OpenAI embedding dimension
          distance: 'Cosine',
        },
      });
      logger.info(`Created Qdrant collection: ${this.collectionName}`);
    } catch (error) {
      logger.error('Error creating Qdrant collection:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // If OpenAI API key is not available, return a mock embedding
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('OpenAI API key not found, using mock embeddings');
        // Return a mock embedding of the correct dimension
        return Array(1536).fill(0).map(() => Math.random());
      }

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      // Return a mock embedding on error
      return Array(1536).fill(0).map(() => Math.random());
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilarDocuments(
    query: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      // Check if Qdrant is available
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        logger.warn('Qdrant not available, returning empty results');
        return [];
      }

      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Search in Qdrant
      const searchResult = await this.qdrantClient.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        with_payload: true,
        with_vector: false,
      });

      // Transform results to match document format
      return searchResult.map((result) => ({
        id: result.id,
        score: result.score,
        ...result.payload,
      }));
    } catch (error) {
      logger.error('Vector search error:', error);
      return [];
    }
  }

  /**
   * Index a document in the vector store
   */
  async indexDocument(
    documentId: string,
    content: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        logger.warn('Qdrant not available, skipping indexing');
        return;
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(content);

      // Upsert to Qdrant
      await this.qdrantClient.upsert(this.collectionName, {
        points: [
          {
            id: documentId,
            vector: embedding,
            payload: {
              ...metadata,
              content_preview: content.substring(0, 500),
              indexed_at: new Date().toISOString(),
            },
          },
        ],
      });

      logger.info(`Indexed document ${documentId} in Qdrant`);
    } catch (error) {
      logger.error('Error indexing document:', error);
      throw error;
    }
  }

  /**
   * Delete a document from the vector store
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        logger.warn('Qdrant not available, skipping deletion');
        return;
      }

      await this.qdrantClient.delete(this.collectionName, {
        points: [documentId],
      });

      logger.info(`Deleted document ${documentId} from Qdrant`);
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Batch index multiple documents
   */
  async batchIndexDocuments(
    documents: Array<{
      id: string;
      content: string;
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        logger.warn('Qdrant not available, skipping batch indexing');
        return;
      }

      // Generate embeddings for all documents
      const embeddings = await Promise.all(
        documents.map((doc) => this.generateEmbedding(doc.content))
      );

      // Prepare points for Qdrant
      const points = documents.map((doc, index) => ({
        id: doc.id,
        vector: embeddings[index],
        payload: {
          ...doc.metadata,
          content_preview: doc.content.substring(0, 500),
          indexed_at: new Date().toISOString(),
        },
      }));

      // Batch upsert to Qdrant
      await this.qdrantClient.upsert(this.collectionName, {
        points,
      });

      logger.info(`Batch indexed ${documents.length} documents in Qdrant`);
    } catch (error) {
      logger.error('Error batch indexing documents:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<any> {
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) {
        return { available: false };
      }

      const info = await this.qdrantClient.getCollection(this.collectionName);
      return {
        available: true,
        vectors_count: info.vectors_count,
        points_count: info.points_count,
        segments_count: info.segments_count,
        status: info.status,
      };
    } catch (error) {
      logger.error('Error getting collection stats:', error);
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}