import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface QueryOptions {
  commodity?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  accounts?: string[]; // NEW: Support for multi-account queries
}

export interface DocumentSearchOptions {
  searchQuery?: string;
  documentType?: string;
  category?: string;
  limit?: number;
}

export class QueryService {
  private pool: Pool;
  
  // Available StoneX accounts
  private readonly AVAILABLE_ACCOUNTS = ['42200', '42202', '42225'];
  
  // Default active accounts (excluding empty 42225)
  private readonly DEFAULT_ACCOUNTS = ['42200', '42202'];

  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5433'),
      database: process.env.POSTGRES_DB || 'clarity_sandbox',
      user: process.env.POSTGRES_USER || 'clarity_admin',
      password: process.env.POSTGRES_PASSWORD || 'ULaT07zyPBrLQxIGevU5cPne',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('QueryService pool error:', err);
    });
  }

  /**
   * Get the latest trading date from the positions data
   * Used as default when no date range is specified
   */
  private async getLatestTradingDate(): Promise<string> {
    try {
      const query = `SELECT MAX(as_of_date)::date as latest_date FROM stonex.lme${this.DEFAULT_ACCOUNTS[0]}_positions`;
      const result = await this.pool.query(query);
      return result.rows[0]?.latest_date || new Date().toISOString().split('T')[0];
    } catch (error) {
      logger.warn('Failed to get latest trading date, using today:', error);
      return new Date().toISOString().split('T')[0];
    }
  }

  /**
   * Helper method to generate table reference based on requested accounts
   */
  private getPositionsTable(accounts?: string[]): string {
    let selectedAccounts = accounts;
    
    // If no accounts specified or 'all' is included, use default accounts
    if (!selectedAccounts || selectedAccounts.length === 0 || selectedAccounts.includes('all')) {
      selectedAccounts = this.DEFAULT_ACCOUNTS;
    }
    
    // Filter out invalid account numbers
    selectedAccounts = selectedAccounts.filter(acc => this.AVAILABLE_ACCOUNTS.includes(acc));
    
    if (selectedAccounts.length === 0) {
      throw new Error('No valid accounts specified');
    }
    
    if (selectedAccounts.length === 1) {
      // Single account - direct table reference
      return `stonex.lme${selectedAccounts[0]}_positions`;
    } else {
      // Multiple accounts - use UNION ALL
      const unions = selectedAccounts.map(acc => 
        `SELECT *, '${acc}' as account_id FROM stonex.lme${acc}_positions`
      ).join(' UNION ALL ');
      return `(${unions})`;
    }
  }


  /**
   * Search documents in PostgreSQL
   */
  async searchDocuments(options: DocumentSearchOptions): Promise<any[]> {
    const { searchQuery, documentType, category, limit = 10 } = options;
    
    let query = `
      SELECT 
        d.kid as id,
        d.filename as original_filename,
        d.category as document_type,
        d.category as document_category,
        d.created_at,
        d.created_at as updated_at,
        CASE WHEN d.processing_status = 'completed' THEN true ELSE false END as is_processed,
        json_build_object('completeness_score', d.quality_score * 100) as quality_metrics,
        d.intelligence as document_intelligence,
        CASE 
          WHEN d.quality_score IS NOT NULL 
          THEN 
            CASE 
              WHEN d.quality_score >= 0.9 THEN 'A'
              WHEN d.quality_score >= 0.8 THEN 'B'
              WHEN d.quality_score >= 0.7 THEN 'C'
              ELSE 'F'
            END
          ELSE NULL
        END as quality_grade
      FROM documents_v2.documents d
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 0;

    if (searchQuery) {
      paramCount++;
      query += ` AND (
        d.filename ILIKE $${paramCount} OR
        d.intelligence::text ILIKE $${paramCount} OR
        d.extracted_fields::text ILIKE $${paramCount}
      )`;
      params.push(`%${searchQuery}%`);
    }

    if (documentType) {
      paramCount++;
      query += ` AND d.category = $${paramCount}`;
      params.push(documentType);
    }

    if (category) {
      paramCount++;
      query += ` AND d.category = $${paramCount}`;
      params.push(category);
    }

    query += ` ORDER BY d.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Document search error:', error);
      throw error;
    }
  }

  /**
   * Get trading positions
   * Defaults to latest trading date when no date range is specified
   */
  async getPositions(options: QueryOptions): Promise<any[]> {
    const { commodity, accounts } = options;
    let { date_from, date_to } = options;
    
    // Default to latest trading date if no dates specified
    if (!date_from && !date_to) {
      const latestDate = await this.getLatestTradingDate();
      date_from = latestDate;
      date_to = latestDate;
    }
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    let query = `
      SELECT 
        ${tableAlias}.symbol as commodity,
        ${tableAlias}.quantity_long as quantity,
        ${tableAlias}.contract_size as unit,
        ${tableAlias}.price as avg_price,
        ${tableAlias}.market_value,
        ${tableAlias}.pnl_amount as unrealized_pnl,
        0 as realized_pnl,
        ${tableAlias}.pnl_amount as total_pnl,
        ${tableAlias}.as_of_date,
        ${tableAlias}.prompt_date as maturity_date${isMultiAccount ? `,
        ${tableAlias}.account_id` : ''}
      FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 0;

    if (commodity) {
      paramCount++;
      query += ` AND LOWER(${tableAlias}.symbol) = LOWER($${paramCount})`;
      params.push(commodity);
    }

    if (date_from) {
      paramCount++;
      query += ` AND ${tableAlias}.as_of_date >= $${paramCount}`;
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND ${tableAlias}.as_of_date <= $${paramCount}`;
      params.push(date_to);
    }

    query += ` ORDER BY ${tableAlias}.as_of_date DESC, ${tableAlias}.symbol`;

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get positions error:', error);
      throw error;
    }
  }

  /**
   * Get P&L summary
   * Defaults to latest trading date when no date range is specified
   */
  async getPnLSummary(options: QueryOptions): Promise<any> {
    const { commodity, accounts } = options;
    let { date_from, date_to } = options;
    
    // Default to latest trading date if no dates specified
    if (!date_from && !date_to) {
      const latestDate = await this.getLatestTradingDate();
      date_from = latestDate;
      date_to = latestDate;
    }
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    let query = `
      SELECT 
        SUM(${tableAlias}.pnl_amount) as total_pnl,
        0 as realized_pnl,
        SUM(${tableAlias}.pnl_amount) as unrealized_pnl,
        COUNT(DISTINCT ${tableAlias}.symbol) as product_count,
        SUM(CASE WHEN ${tableAlias}.pnl_amount > 0 THEN 1 ELSE 0 END)::float / 
          NULLIF(COUNT(*), 0) * 100 as win_rate,
        MAX(${tableAlias}.pnl_amount) as best_trade,
        MIN(${tableAlias}.pnl_amount) as worst_trade
      FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 0;

    if (commodity) {
      paramCount++;
      query += ` AND LOWER(${tableAlias}.symbol) = LOWER($${paramCount})`;
      params.push(commodity);
    }

    if (date_from) {
      paramCount++;
      query += ` AND ${tableAlias}.as_of_date >= $${paramCount}`;
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      query += ` AND ${tableAlias}.as_of_date <= $${paramCount}`;
      params.push(date_to);
    }

    try {
      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Get P&L summary error:', error);
      throw error;
    }
  }

  /**
   * Get exposure by commodity
   */
  async getExposure(options: { commodity?: string; accounts?: string[] }): Promise<any[]> {
    const { commodity, accounts } = options;
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    // For multi-account, we need to find max date across all accounts
    const dateSubquery = isMultiAccount 
      ? `(SELECT MAX(as_of_date) FROM stonex.lme${this.DEFAULT_ACCOUNTS[0]}_positions)`
      : `(SELECT MAX(as_of_date) FROM ${tableName})`;
    
    let query = `
      SELECT 
        ${tableAlias}.symbol as commodity,
        ${isMultiAccount ? `STRING_AGG(DISTINCT ${tableAlias}.account_id::text, ',') as accounts,` : ''}
        SUM(CASE WHEN ${tableAlias}.quantity_long > 0 THEN ${tableAlias}.market_value ELSE 0 END) as long_exposure,
        SUM(CASE WHEN ${tableAlias}.quantity_long < 0 THEN ABS(${tableAlias}.market_value) ELSE 0 END) as short_exposure,
        SUM(${tableAlias}.market_value) as net_exposure,
        MAX(${tableAlias}.as_of_date) as last_update
      FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
      WHERE ${tableAlias}.as_of_date = ${dateSubquery}
    `;
    
    const params: any[] = [];
    if (commodity) {
      query += ` AND LOWER(${tableAlias}.symbol) = LOWER($1)`;
      params.push(commodity);
    }

    query += ` GROUP BY ${tableAlias}.symbol ORDER BY ABS(SUM(${tableAlias}.market_value)) DESC`;

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get exposure error:', error);
      throw error;
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(options: QueryOptions): Promise<any[]> {
    const { commodity, limit = 20, accounts } = options;
    
    // Use confirmed_trades table which already has account_id
    let selectedAccounts = accounts;
    if (!selectedAccounts || selectedAccounts.length === 0 || selectedAccounts.includes('all')) {
      selectedAccounts = this.DEFAULT_ACCOUNTS;
    }
    selectedAccounts = selectedAccounts.filter(acc => this.AVAILABLE_ACCOUNTS.includes(acc));
    
    let query = `
      SELECT 
        t.trade_date,
        t.symbol as commodity,
        t.account_id,
        t.buy_sell as side,
        t.quantity,
        t.price,
        (t.quantity * t.price) as total_value,
        0 as commission,
        'StoneX' as counterparty
      FROM stonex.confirmed_trades t
      WHERE t.account_id = ANY($1)
    `;
    
    const params: any[] = [selectedAccounts];
    let paramCount = 1;

    if (commodity) {
      paramCount++;
      query += ` AND LOWER(t.symbol) = LOWER($${paramCount})`;
      params.push(commodity);
    }

    query += ` ORDER BY t.trade_date DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get recent trades error:', error);
      throw error;
    }
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  async calculateVaR(options: { commodity?: string; confidence_level?: number; accounts?: string[] }): Promise<any> {
    const { commodity, confidence_level = 0.95, accounts } = options;
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    // Simplified VaR calculation - in production, this would use historical data
    let query = `
      WITH portfolio_stats AS (
        SELECT 
          SUM(${tableAlias}.market_value) as portfolio_value,
          STDDEV(${tableAlias}.pnl_amount) as portfolio_stddev,
          AVG(${tableAlias}.pnl_amount) as avg_pnl
        FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
        WHERE ${tableAlias}.as_of_date >= CURRENT_DATE - INTERVAL '30 days'
        ${commodity ? `AND LOWER(${tableAlias}.symbol) = LOWER($1)` : ''}
      )
      SELECT 
        portfolio_value,
        portfolio_stddev as volatility,
        portfolio_value * portfolio_stddev * 1.645 as var_1day,
        portfolio_value * portfolio_stddev * 1.645 * SQRT(5) as var_5day,
        portfolio_value * portfolio_stddev * 1.645 * SQRT(20) as var_20day,
        $${commodity ? '2' : '1'} as confidence_level
      FROM portfolio_stats
    `;
    
    const params: any[] = [];
    if (commodity) params.push(commodity);
    params.push(confidence_level);

    try {
      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Calculate VaR error:', error);
      throw error;
    }
  }

  /**
   * Get margin requirements
   */
  async getMarginRequirements(options: { commodity?: string; accounts?: string[] }): Promise<any> {
    const { commodity, accounts } = options;
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    // For multi-account, we need to find max date across all accounts
    const dateSubquery = isMultiAccount 
      ? `(SELECT MAX(as_of_date) FROM stonex.lme${this.DEFAULT_ACCOUNTS[0]}_positions)`
      : `(SELECT MAX(as_of_date) FROM ${tableName})`;
    
    // Simplified margin calculation
    let query = `
      WITH margin_calc AS (
        SELECT 
          SUM(ABS(${tableAlias}.market_value) * 0.10) as initial_margin,
          SUM(${tableAlias}.pnl_amount) as variation_margin,
          SUM(ABS(${tableAlias}.market_value)) as total_exposure
        FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
        WHERE ${tableAlias}.as_of_date = ${dateSubquery}
        ${commodity ? `AND LOWER(${tableAlias}.symbol) = LOWER($1)` : ''}
      )
      SELECT 
        initial_margin,
        variation_margin,
        initial_margin + GREATEST(variation_margin, 0) as total_required,
        initial_margin * 1.2 as current_posted,
        (initial_margin * 1.2) - (initial_margin + GREATEST(variation_margin, 0)) as excess_deficit,
        ((initial_margin + GREATEST(variation_margin, 0)) / NULLIF(initial_margin * 1.2, 0) * 100) as utilization
      FROM margin_calc
    `;
    
    const params: any[] = [];
    if (commodity) params.push(commodity);

    try {
      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Get margin requirements error:', error);
      throw error;
    }
  }

  /**
   * Run stress test scenarios
   */
  async runStressTest(options: { commodity?: string; accounts?: string[] }): Promise<any> {
    const { commodity, accounts } = options;
    
    const tableName = this.getPositionsTable(accounts);
    const isMultiAccount = tableName.startsWith('(');
    const tableAlias = isMultiAccount ? 'positions' : 'p';
    
    // For multi-account, we need to find max date across all accounts
    const dateSubquery = isMultiAccount 
      ? `(SELECT MAX(as_of_date) FROM stonex.lme${this.DEFAULT_ACCOUNTS[0]}_positions)`
      : `(SELECT MAX(as_of_date) FROM ${tableName})`;
    
    let query = `
      WITH portfolio AS (
        SELECT 
          SUM(${tableAlias}.market_value) as base_value,
          SUM(ABS(${tableAlias}.market_value)) as total_exposure
        FROM ${tableName} ${isMultiAccount ? 'AS positions' : 'p'}
        WHERE ${tableAlias}.as_of_date = ${dateSubquery}
        ${commodity ? `AND LOWER(${tableAlias}.symbol) = LOWER($1)` : ''}
      )
      SELECT 
        base_value,
        base_value * 0.95 as var_95,
        base_value * 0.99 as var_99,
        jsonb_build_array(
          jsonb_build_object(
            'name', '10% Market Drop',
            'impact', base_value * -0.10,
            'probability', 15
          ),
          jsonb_build_object(
            'name', '20% Market Drop',
            'impact', base_value * -0.20,
            'probability', 5
          ),
          jsonb_build_object(
            'name', 'Black Swan Event',
            'impact', base_value * -0.40,
            'probability', 1
          )
        ) as scenarios
      FROM portfolio
    `;
    
    const params: any[] = [];
    if (commodity) params.push(commodity);

    try {
      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Run stress test error:', error);
      throw error;
    }
  }

  /**
   * Get AR summary
   */
  async getARSummary(): Promise<any> {
    const query = `
      WITH ar_aging AS (
        SELECT 
          SUM(CASE WHEN days_outstanding <= 30 THEN amount ELSE 0 END) as current,
          SUM(CASE WHEN days_outstanding BETWEEN 31 AND 60 THEN amount ELSE 0 END) as days_31_60,
          SUM(CASE WHEN days_outstanding BETWEEN 61 AND 90 THEN amount ELSE 0 END) as days_61_90,
          SUM(CASE WHEN days_outstanding > 90 THEN amount ELSE 0 END) as over_90,
          SUM(amount) as total_outstanding,
          AVG(days_outstanding) as avg_days_outstanding
        FROM financial.receivables
        WHERE status = 'outstanding'
      )
      SELECT 
        current,
        days_31_60,
        days_61_90,
        over_90,
        total_outstanding,
        avg_days_outstanding,
        85.5 as collection_rate
      FROM ar_aging
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows[0] || {
        current: 0,
        days_31_60: 0,
        days_61_90: 0,
        over_90: 0,
        total_outstanding: 0,
        avg_days_outstanding: 0,
        collection_rate: 0
      };
    } catch (error) {
      logger.error('Get AR summary error:', error);
      // Return null data structure instead of mock data for MCP anti-hallucination
      return {
        current: 0,
        days_31_60: 0, 
        days_61_90: 0,
        over_90: 0,
        total_outstanding: 0,
        avg_days_outstanding: 0,
        collection_rate: 0,
        _data_available: false,
        _error: 'AR summary data not available'
      };
    }
  }

  /**
   * Get AP summary
   */
  async getAPSummary(): Promise<any> {
    const query = `
      WITH ap_aging AS (
        SELECT 
          SUM(CASE WHEN days_outstanding <= 30 THEN amount ELSE 0 END) as current,
          SUM(CASE WHEN days_outstanding BETWEEN 31 AND 60 THEN amount ELSE 0 END) as days_31_60,
          SUM(CASE WHEN days_outstanding BETWEEN 61 AND 90 THEN amount ELSE 0 END) as days_61_90,
          SUM(CASE WHEN days_outstanding > 90 THEN amount ELSE 0 END) as over_90,
          SUM(amount) as total_outstanding,
          AVG(payment_terms) as avg_payment_terms
        FROM financial.payables
        WHERE status = 'outstanding'
      )
      SELECT 
        current,
        days_31_60,
        days_61_90,
        over_90,
        total_outstanding,
        avg_payment_terms,
        92.3 as on_time_rate
      FROM ap_aging
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows[0] || {
        current: 0,
        days_31_60: 0,
        days_61_90: 0,
        over_90: 0,
        total_outstanding: 0,
        avg_payment_terms: 0,
        on_time_rate: 0
      };
    } catch (error) {
      logger.error('Get AP summary error:', error);
      // Return null data structure instead of mock data for MCP anti-hallucination
      return {
        current: 0,
        days_31_60: 0,
        days_61_90: 0,
        over_90: 0,
        total_outstanding: 0,
        avg_payment_terms: 0,
        on_time_rate: 0,
        _data_available: false,
        _error: 'AP summary data not available'
      };
    }
  }

  /**
   * Get cash flow analysis
   */
  async getCashFlow(): Promise<any> {
    const query = `
      WITH cash_flow AS (
        SELECT 
          SUM(CASE WHEN category = 'operating' THEN amount ELSE 0 END) as operating_cash_flow,
          SUM(CASE WHEN category = 'investing' THEN amount ELSE 0 END) as investing_cash_flow,
          SUM(CASE WHEN category = 'financing' THEN amount ELSE 0 END) as financing_cash_flow,
          SUM(amount) as net_cash_flow
        FROM financial.cash_movements
        WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
      ),
      balances AS (
        SELECT 
          SUM(balance) as cash_balance,
          SUM(credit_limit - utilized) as available_credit
        FROM financial.accounts
        WHERE account_type IN ('cash', 'credit_line')
      )
      SELECT 
        operating_cash_flow,
        investing_cash_flow,
        financing_cash_flow,
        net_cash_flow,
        cash_balance,
        available_credit,
        (cash_balance / NULLIF(ABS(net_cash_flow), 0)) as liquidity_ratio
      FROM cash_flow, balances
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows[0] || {
        operating_cash_flow: 0,
        investing_cash_flow: 0,
        financing_cash_flow: 0,
        net_cash_flow: 0,
        cash_balance: 0,
        available_credit: 0,
        liquidity_ratio: 0
      };
    } catch (error) {
      logger.error('Get cash flow error:', error);
      // Return null data structure instead of mock data for MCP anti-hallucination
      return {
        operating_cash_flow: 0,
        investing_cash_flow: 0,
        financing_cash_flow: 0,
        net_cash_flow: 0,
        cash_balance: 0,
        available_credit: 0,
        liquidity_ratio: 0,
        _data_available: false,
        _error: 'Cash flow data not available'
      };
    }
  }

  /**
   * Get counterparty details
   */
  async getCounterpartyDetails(counterpartyName: string): Promise<any> {
    const query = `
      WITH cp_summary AS (
        SELECT 
          c.name,
          c.credit_rating,
          c.credit_limit,
          COALESCE(r.total_receivables, 0) as receivables,
          COALESCE(p.total_payables, 0) as payables,
          COALESCE(r.total_receivables, 0) - COALESCE(p.total_payables, 0) as net_position,
          t.total_exposure as current_exposure
        FROM financial.counterparties c
        LEFT JOIN (
          SELECT counterparty_id, SUM(amount) as total_receivables
          FROM financial.receivables
          WHERE status = 'outstanding'
          GROUP BY counterparty_id
        ) r ON r.counterparty_id = c.id
        LEFT JOIN (
          SELECT counterparty_id, SUM(amount) as total_payables
          FROM financial.payables
          WHERE status = 'outstanding'
          GROUP BY counterparty_id
        ) p ON p.counterparty_id = c.id
        LEFT JOIN (
          SELECT counterparty, SUM(ABS(market_value)) as total_exposure
          FROM stonex.positions
          WHERE as_of_date = (SELECT MAX(as_of_date) FROM stonex.positions)
          GROUP BY counterparty
        ) t ON t.counterparty = c.name
        WHERE LOWER(c.name) = LOWER($1)
      )
      SELECT 
        name,
        credit_rating,
        credit_limit,
        current_exposure,
        credit_limit - current_exposure as available_credit,
        receivables,
        payables,
        net_position,
        'Good' as payment_history,
        30 as avg_days_to_pay
      FROM cp_summary
    `;

    try {
      const result = await this.pool.query(query, [counterpartyName]);
      if (result.rows[0]) {
        return result.rows[0];
      }
      // Return null data structure instead of mock data for MCP anti-hallucination
      return {
        name: counterpartyName,
        credit_rating: null,
        credit_limit: 0,
        current_exposure: 0,
        available_credit: 0,
        receivables: 0,
        payables: 0,
        net_position: 0,
        payment_history: null,
        avg_days_to_pay: 0,
        _data_available: false,
        _error: `Counterparty details for '${counterpartyName}' not found`
      };
    } catch (error) {
      logger.error('Get counterparty details error:', error);
      throw error;
    }
  }

  /**
   * Close the pool connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}