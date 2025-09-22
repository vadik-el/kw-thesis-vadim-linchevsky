import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { GrafanaService } from '../../grafanaService';
import { logger } from '../../../utils/logger';

const GetDashboardSchema = z.object({
  dashboard_name: z.enum(['margin-risk', 'cash-collateral', 'positions-exposure']).describe("Name of the dashboard to retrieve"),
  time_range: z.enum(['24h', '7d', '30d', '90d']).default('7d').describe("Time range for the dashboard")
});

export class GetDashboardTool extends DynamicTool {
  private grafanaService: GrafanaService;

  constructor() {
    super({
      name: "get_dashboard",
      description: "Retrieve and embed a Grafana dashboard visualization. Returns REAL dashboard URLs and snapshots.",
      schema: GetDashboardSchema,
      func: async (input) => {
        return await this.getDashboard(input);
      }
    });

    this.grafanaService = new GrafanaService();
  }

  private async getDashboard(args: any): Promise<string> {
    const { dashboard_name, time_range = '7d' } = args;
    
    logger.info("📊 GetDashboardTool executing REAL dashboard fetch with:", { dashboard_name, time_range });

    try {
      const dashboardUrl = await this.grafanaService.getDashboardUrl(dashboard_name, time_range);
      const snapshotUrl = await this.grafanaService.createSnapshot(dashboard_name, time_range);

      return `📊 **${dashboard_name.replace('-', ' ').toUpperCase()} Dashboard**

**Time Range:** ${time_range}

**Interactive Dashboard:** [Open in Grafana](${dashboardUrl})
**Snapshot:** [View Snapshot](${snapshotUrl})

You can embed this dashboard in your workspace using the following iframe:
\`\`\`html
<iframe src="${dashboardUrl}" width="100%" height="600"></iframe>
\`\`\``;

    } catch (error) {
      logger.error("❌ GetDashboardTool error:", error);
      return `Error retrieving dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}