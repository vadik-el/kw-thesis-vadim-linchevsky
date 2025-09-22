import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { Terminal49Service } from '../../terminal49Service';
import { logger } from '../../../utils/logger';

const TrackVesselSchema = z.object({
  bl_number: z.string().describe("Bill of Lading number")
});

export class TrackVesselTool extends DynamicTool {
  private terminal49Service: Terminal49Service;

  constructor() {
    super({
      name: "track_vessel",
      description: "Get real-time vessel tracking information by B/L number. Returns REAL vessel data from Terminal49 API.",
      schema: TrackVesselSchema,
      func: async (input) => {
        return await this.executeTracking(input);
      }
    });

    this.terminal49Service = new Terminal49Service();
  }

  private async executeTracking(args: any): Promise<string> {
    const { bl_number } = args;
    
    logger.info("🚢 TrackVesselTool executing REAL tracking with:", { bl_number });

    try {
      const trackingData = await this.terminal49Service.trackVessel(bl_number);
      
      if (!trackingData) {
        return `No tracking information found for B/L: ${bl_number}`;
      }

      return `🚢 **Vessel Tracking for B/L: ${bl_number}**

**Vessel:** ${trackingData.vessel_name || 'Unknown'}
**Carrier:** ${trackingData.carrier_name || 'Unknown'}
**Status:** ${trackingData.status || 'In Transit'}

**Route:**
- **Origin:** ${trackingData.pol_name || 'Unknown'}
- **Destination:** ${trackingData.pod_name || 'Unknown'}
- **Current Location:** ${trackingData.current_location || 'Unknown'}
- **ETA:** ${trackingData.eta ? new Date(trackingData.eta).toLocaleDateString() : 'Unknown'}

**Containers:** ${trackingData.container_count || 0}
**Last Update:** ${trackingData.last_update ? new Date(trackingData.last_update).toLocaleString() : 'Unknown'}`;

    } catch (error) {
      logger.error("❌ TrackVesselTool error:", error);
      return `Error tracking vessel: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}