import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

// Terminal49 API types
interface Terminal49Shipment {
  id: string;
  reference_numbers: string[];
  port_of_lading?: {
    name: string;
    locode: string;
    country: string;
  };
  port_of_discharge?: {
    name: string;
    locode: string;
    country: string;
  };
  vessel?: {
    name: string;
    imo: string;
    mmsi?: string;
  };
  carrier?: {
    name: string;
    scac: string;
  };
  events?: Terminal49Event[];
  containers?: Terminal49Container[];
}

interface Terminal49Event {
  type: string;
  created_at: string;
  location?: {
    name: string;
    locode?: string;
    latitude?: number;
    longitude?: number;
  };
  vessel_position?: {
    latitude: number;
    longitude: number;
  };
}

interface Terminal49Container {
  number: string;
  type: string;
  size: string;
}

interface VesselPosition {
  bl_number: string;
  vessel_name?: string;
  vessel_imo?: string;
  carrier_name?: string;
  carrier_scac?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  latitude?: number;
  longitude?: number;
  tracking_status: string;
  last_event_date?: string;
  eta_pod?: string;
  container_count: number;
  // Terminal49 Map embedding fields
  terminal49_shipment_id?: string;
  terminal49_container_ids?: string[];
  terminal49_last_sync?: string;
  terminal49_tracking_request_id?: string;
}

// Interface for Terminal49 Map embedding data
interface Terminal49EmbedData {
  shipmentId: string;
  containerIds: string[];
  publishableKey: string;
  fallbackUrl: string;
}

export class Terminal49Service {
  private client: AxiosInstance | null = null;
  private apiKey: string = '';
  private baseUrl: string = 'https://api.terminal49.com/v2';
  private initialized: boolean = false;

  constructor() {
    // Don't initialize immediately - wait for environment to be loaded
  }

  private initialize() {
    if (this.initialized) return;
    
    this.apiKey = process.env.TERMINAL49_API_KEY || '';
    
    logger.info('Terminal49 Service initializing...');
    logger.info('API Key configured:', !!this.apiKey);
    logger.info('API Key length:', this.apiKey.length);
    
    if (!this.apiKey) {
      logger.error('Terminal49 API key not configured! Set TERMINAL49_API_KEY in .env file');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Terminal49 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Terminal49 API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Terminal49 API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Terminal49 API Error Details:');
        logger.error(`Status: ${error.response?.status}`);
        logger.error(`Status Text: ${error.response?.statusText}`);
        logger.error(`Headers: ${JSON.stringify(error.response?.headers)}`);
        logger.error(`Error Response Body: ${JSON.stringify(error.response?.data, null, 2)}`);
        logger.error(`Request URL: ${error.config?.url}`);
        logger.error(`Request Method: ${error.config?.method}`);
        logger.error(`Request Headers: ${JSON.stringify(error.config?.headers, null, 2)}`);
        logger.error(`Request Data: ${JSON.stringify(error.config?.data, null, 2)}`);
        return Promise.reject(error);
      }
    );
    
    this.initialized = true;
  }

  /**
   * Track a shipment by B/L number and SCAC code
   */
  async trackShipment(blNumber: string, scacCode?: string): Promise<VesselPosition | null> {
    // Initialize on first use
    this.initialize();
    
    if (!this.apiKey) {
      logger.warn('Terminal49 API key not configured, returning mock data');
      return this.getMockVesselData(blNumber);
    }
    
    if (!this.client) {
      logger.error('Terminal49 client not initialized properly');
      return this.getMockVesselData(blNumber);
    }

    try {
      // If no SCAC provided, try to search by reference number first
      if (!scacCode) {
        logger.info(`No SCAC provided for ${blNumber}, searching by reference number`);
        const searchResponse = await this.client.get('/shipments', {
          params: {
            'reference_numbers': blNumber,
            'limit': 1
          }
        });

        const shipments = searchResponse.data.data;
        if (!shipments || shipments.length === 0) {
          logger.info(`No shipment found for B/L number: ${blNumber}`);
          return this.getMockVesselData(blNumber);
        }

        const shipment: Terminal49Shipment = shipments[0];
        
        // Get detailed shipment information
        const detailResponse = await this.client.get(`/shipments/${shipment.id}`);
        const detailedShipment: Terminal49Shipment = detailResponse.data.data;

        return await this.mapTerminal49ShipmentToVessel(detailedShipment, blNumber);
      }

      // Use EXACT Terminal49 tracking request format
      logger.info(`Tracking shipment with B/L: ${blNumber} and SCAC: ${scacCode}`);
      
      const trackingRequest = {
        data: {
          attributes: {
            request_type: 'bill_of_lading',
            request_number: blNumber,
            ref_numbers: [],
            shipment_tags: [],
            scac: scacCode
          },
          relationships: {},
          type: 'tracking_request'
        }
      };

      // Log the full request for debugging
      logger.info('========== TERMINAL49 API REQUEST ==========');
      logger.info('URL:', `${this.baseUrl}/tracking_requests`);
      logger.info('Method: POST');
      logger.info('Headers:');
      logger.info(`  Authorization: Token ${this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET'}`);
      logger.info('  Content-Type: application/json');
      logger.info('  Accept: application/json');
      logger.info('Body:');
      logger.info(JSON.stringify(trackingRequest, null, 2));
      logger.info('==========================================');

      const trackingResponse = await this.client.post('/tracking_requests', trackingRequest);
      const trackingResult = trackingResponse.data.data;

      logger.info('Terminal49 Tracking Request Created:', {
        id: trackingResult.id,
        status: trackingResult.attributes?.status,
        request_number: trackingResult.attributes?.request_number,
        scac: trackingResult.attributes?.scac
      });

      // Terminal49 returns a tracking request, not immediate shipment data
      // The tracking request will be processed asynchronously
      if (trackingResult.attributes?.status === 'pending') {
        logger.info(`Tracking request created successfully. Status: pending. ID: ${trackingResult.id}`);
        
        // Wait a moment for Terminal49 to process, then try to retrieve shipments
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        try {
          logger.info(`Attempting to retrieve shipments for B/L: ${blNumber}`);
          const shipments = await this.getShipments(blNumber);
          
          if (shipments.length > 0) {
            logger.info(`Found ${shipments.length} shipment(s) for B/L: ${blNumber}`);
            const shipment = shipments[0];
            
            // Map the shipment to our vessel position format
            const vesselData = await this.mapTerminal49ShipmentToVessel(shipment, blNumber);
            vesselData.terminal49_tracking_request_id = trackingResult.id;
            return vesselData;
          } else {
            logger.info(`No shipments found yet for B/L: ${blNumber}, returning tracking info`);
            // Return minimal data with tracking request info
            return {
              bl_number: blNumber,
              tracking_status: 'tracking_initiated',
              terminal49_tracking_request_id: trackingResult.id,
              carrier_scac: scacCode,
              container_count: 0,
              terminal49_last_sync: new Date().toISOString()
            };
          }
        } catch (shipmentError: any) {
          logger.error(`Error retrieving shipments after tracking request:`, shipmentError.message);
          // Return minimal data with tracking request info
          return {
            bl_number: blNumber,
            tracking_status: 'tracking_initiated',
            terminal49_tracking_request_id: trackingResult.id,
            carrier_scac: scacCode,
            container_count: 0,
            terminal49_last_sync: new Date().toISOString()
          };
        }
      }

      // If we somehow got immediate shipment data (unlikely based on docs)
      if (trackingResult.relationships?.tracked_object?.data) {
        const trackedObject = trackingResult.relationships.tracked_object.data;
        if (trackedObject.type === 'shipment') {
          // Retrieve the shipment
          const detailResponse = await this.client.get(`/shipments/${trackedObject.id}`);
          const detailedShipment: Terminal49Shipment = detailResponse.data.data;
          return await this.mapTerminal49ShipmentToVessel(detailedShipment, blNumber);
        }
      }

      // Fallback to mock data
      return this.getMockVesselData(blNumber);

    } catch (error: any) {
      logger.error(`Error tracking shipment ${blNumber} with SCAC ${scacCode}:`, error.message);
      
      // Handle duplicate tracking request error
      if (error.response?.status === 422 && error.response?.data?.errors?.[0]?.code === 'duplicate') {
        const errorData = error.response.data.errors[0];
        logger.info(`Tracking request already exists for ${blNumber}. ID: ${errorData.meta?.tracking_request_id}`);
        
        // Try to retrieve existing shipment data
        try {
          logger.info(`Attempting to retrieve existing shipment for B/L: ${blNumber}`);
          const shipments = await this.getShipments(blNumber);
          
          if (shipments.length > 0) {
            logger.info(`Found ${shipments.length} existing shipment(s) for B/L: ${blNumber}`);
            const shipment = shipments[0];
            
            // Map the shipment to our vessel position format
            const vesselData = await this.mapTerminal49ShipmentToVessel(shipment, blNumber);
            vesselData.terminal49_tracking_request_id = errorData.meta?.tracking_request_id;
            return vesselData;
          } else {
            logger.info(`No shipments found yet for duplicate B/L: ${blNumber}`);
            // Return minimal data with tracking request info
            return {
              bl_number: blNumber,
              tracking_status: 'tracking_exists',
              terminal49_tracking_request_id: errorData.meta?.tracking_request_id,
              carrier_scac: scacCode,
              container_count: 0,
              terminal49_last_sync: new Date().toISOString()
            };
          }
        } catch (shipmentError: any) {
          logger.error(`Error retrieving existing shipments:`, shipmentError.message);
        }
      }
      
      // If Terminal49 API fails, check if we should use mock data
      const useMockData = process.env.TERMINAL49_USE_MOCK === 'true';
      
      if (error.response?.status === 404) {
        logger.info(`Shipment ${blNumber} not found in Terminal49`);
        if (useMockData) {
          logger.info('Using mock data for development');
          return this.getMockVesselData(blNumber);
        }
        return null;
      }
      
      // For other errors, throw them so we can see what's wrong
      if (!useMockData) {
        throw new Error(`Terminal49 API error: ${error.message}`);
      }
      
      logger.warn(`Terminal49 API error, falling back to mock data: ${error.message}`);
      return this.getMockVesselData(blNumber);
    }
  }

  /**
   * Retrieve shipments from Terminal49
   */
  async getShipments(blNumber?: string): Promise<any[]> {
    // Initialize on first use
    this.initialize();
    
    if (!this.apiKey || !this.client) {
      logger.error('Terminal49 client not initialized');
      return [];
    }

    try {
      logger.info(`Retrieving ALL tracked shipments from Terminal49...`);
      
      // Per Terminal49 docs: Get ALL shipments, don't filter by B/L in API call
      const params: any = {
        'page[size]': 100, // Use JSON:API pagination format
        'page[number]': 1
      };
      
      // Use proper JSON:API format as specified in Terminal49 docs
      const response = await this.client.get('/shipments', {
        params,
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json',
          'Authorization': `Token ${this.apiKey}`
        }
      });
      
      const allShipments = response.data.data || [];
      logger.info(`Retrieved ${allShipments.length} total tracked shipments from Terminal49`);
      
      // If we have a specific B/L, filter client-side as Terminal49 recommends
      if (blNumber) {
        const matchingShipments = allShipments.filter((shipment: any) => {
          // Check if bill_of_lading_number matches our B/L
          const bolNumber = shipment.attributes?.bill_of_lading_number;
          if (bolNumber) {
            return bolNumber.toUpperCase().includes(blNumber.toUpperCase()) ||
                   blNumber.toUpperCase().includes(bolNumber.toUpperCase());
          }
          
          // Also check reference numbers as fallback
          const referenceNumbers = shipment.attributes?.ref_numbers || [];
          return referenceNumbers.some((ref: string) => 
            ref.toUpperCase().includes(blNumber.toUpperCase()) ||
            blNumber.toUpperCase().includes(ref.toUpperCase())
          );
        });
        
        logger.info(`Found ${matchingShipments.length} shipments matching B/L: ${blNumber}`);
        if (matchingShipments.length > 0) {
          logger.info('Matching shipment details:', matchingShipments.map((s: any) => ({
            id: s.id,
            bill_of_lading_number: s.attributes?.bill_of_lading_number,
            ref_numbers: s.attributes?.ref_numbers,
            vessel_name: s.attributes?.pod_vessel_name,
            port_of_lading: s.attributes?.port_of_lading_name,
            port_of_discharge: s.attributes?.port_of_discharge_name
          })));
        }
        
        return matchingShipments;
      }
      
      // Log all shipment details for debugging
      logger.info('All shipment details:', allShipments.map((s: any) => ({
        id: s.id,
        bill_of_lading_number: s.attributes?.bill_of_lading_number,
        vessel_name: s.attributes?.pod_vessel_name,
        carrier: s.attributes?.shipping_line_name
      })));
      
      return allShipments;
      
    } catch (error: any) {
      logger.error('Error retrieving shipments from Terminal49:', error.message);
      if (error.response) {
        logger.error('Terminal49 API Response status:', error.response.status);
        logger.error('Terminal49 API Response data:', JSON.stringify(error.response.data, null, 2));
      }
      return [];
    }
  }

  /**
   * Get vessel position updates for a tracked shipment
   */
  async getVesselPosition(blNumber: string): Promise<{ latitude?: number; longitude?: number } | null> {
    // Initialize on first use
    this.initialize();
    
    if (!this.apiKey) {
      return { latitude: 22.3193, longitude: 114.1694 }; // Mock Hong Kong position
    }

    try {
      const vessel = await this.trackShipment(blNumber);
      if (!vessel) {
        return null;
      }

      return {
        latitude: vessel.latitude,
        longitude: vessel.longitude
      };
    } catch (error: any) {
      logger.error(`Error getting vessel position for ${blNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Map Terminal49 shipment from API response to our VesselPosition format
   */
  public async mapTerminal49ShipmentToVessel(shipment: any, blNumber: string): Promise<VesselPosition> {
    // Terminal49 shipment response has attributes at the top level
    const attributes = shipment.attributes || {};
    const relationships = shipment.relationships || {};
    
    logger.info(`🔍 Position Extraction Analysis for ${blNumber}:`);
    logger.info(`📦 Shipment Data Structure:`, {
      id: shipment.id,
      type: shipment.type,
      has_attributes: !!attributes,
      has_relationships: !!relationships,
      relationship_keys: Object.keys(relationships),
      has_events_direct: !!(shipment.events && shipment.events.length > 0),
      has_transport_events_rel: !!(relationships.transport_events?.data?.length > 0),
      containers_count: relationships.containers?.data?.length || 0
    });
    
    // Extract position data from events if available
    let latitude: number | undefined;
    let longitude: number | undefined;
    let lastEventDate: string | undefined;

    // METHOD 1: Check if shipment has events data directly (legacy format)
    if (shipment.events && shipment.events.length > 0) {
      logger.info(`📊 Found ${shipment.events.length} direct events in shipment data`);
      
      // Sort events by date descending to get the latest
      const sortedEvents = shipment.events.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      for (const event of sortedEvents) {
        logger.info(`🔍 Analyzing event:`, {
          id: event.id,
          type: event.type,
          has_vessel_position: !!event.vessel_position,
          has_location: !!event.location,
          vessel_position_data: event.vessel_position,
          location_data: event.location
        });
        
        if (event.vessel_position?.latitude && event.vessel_position?.longitude) {
          latitude = event.vessel_position.latitude;
          longitude = event.vessel_position.longitude;
          lastEventDate = event.created_at;
          logger.info(`✅ Found coordinates in vessel_position: ${latitude}, ${longitude}`);
          break;
        } else if (event.location?.latitude && event.location?.longitude) {
          latitude = event.location.latitude;
          longitude = event.location.longitude;
          lastEventDate = event.created_at;
          logger.info(`✅ Found coordinates in location: ${latitude}, ${longitude}`);
          break;
        }
      }

      // If no position found, use the latest event date
      if (!lastEventDate && sortedEvents.length > 0) {
        lastEventDate = sortedEvents[0].created_at;
      }
    }
    
    // METHOD 2: Check container transport events (accessible via container endpoint)
    // Note: Transport events don't include coordinates in the API responses
    if (!latitude && !longitude && relationships.containers?.data?.length > 0) {
      logger.info(`📊 Shipment has ${relationships.containers.data.length} container(s)`);
      logger.info(`ℹ️  Transport events are accessible via /containers/{id}/transport_events`);
      logger.info(`📍 However, transport events don't include coordinates in the response`);
      logger.info(`💡 Available data: event type, location LOCODE, timestamp, voyage number`);
      logger.info(`🔍 To get coordinates, Terminal49 may require additional API features`);
    }
    
    // METHOD 3: Check containers for position data
    if (!latitude && !longitude && relationships.containers?.data?.length > 0) {
      logger.info(`📦 Checking ${relationships.containers.data.length} containers for position data`);
      // Note: This would require separate API calls to get container details
      logger.info(`💡 Containers may have position data via separate API calls`);
    }
    
    // Log position extraction result based on actual API behavior
    if (latitude && longitude) {
      logger.info(`🎯 Position extraction SUCCESS: ${blNumber} at ${latitude}, ${longitude}`);
      logger.info(`✅ Coordinates found in shipment data`);
    } else {
      logger.info(`ℹ️  No coordinates available for ${blNumber} in Terminal49 API response`);
      logger.info(`📍 Available location data:`, {
        bl_number: blNumber,
        vessel_name: attributes.pod_vessel_name || attributes.pol_vessel_name || 'Unknown',
        port_of_loading: attributes.port_of_lading_name || 'Unknown',
        port_of_discharge: attributes.port_of_discharge_name || 'Unknown',
        carrier: attributes.shipping_line_name || 'Unknown',
        status: attributes.lifecycle_status || 'Unknown'
      });
      logger.info(`🔍 Based on API testing:`);
      logger.info(`   • Shipment endpoint doesn't include vessel coordinates`);
      logger.info(`   • Transport events are accessible but also lack coordinates`);
      logger.info(`   • Contact Terminal49 support to inquire about coordinate access`);
    }
    
    return {
      bl_number: blNumber,
      vessel_name: attributes.pod_vessel_name || attributes.pol_vessel_name,
      vessel_imo: attributes.pod_vessel_imo || attributes.pol_vessel_imo,
      carrier_name: attributes.shipping_line_name,
      carrier_scac: attributes.shipping_line_scac,
      port_of_loading: attributes.port_of_lading_name,
      port_of_discharge: attributes.port_of_discharge_name,
      latitude,
      longitude,
      tracking_status: this.mapTerminal49Status(attributes.lifecycle_status),
      last_event_date: lastEventDate || attributes.line_tracking_last_succeeded_at || attributes.created_at,
      eta_pod: attributes.pod_ata_at || attributes.pod_eta_at,
      container_count: relationships.containers?.data?.length || 0,
      terminal49_shipment_id: shipment.id,
      terminal49_container_ids: relationships.containers?.data?.map((c: any) => c.id) || [],
      terminal49_last_sync: new Date().toISOString(),
    };
  }

  /**
   * Map Terminal49 lifecycle status to our tracking status
   */
  private mapTerminal49Status(lifecycleStatus?: string): string {
    if (!lifecycleStatus) return 'pending';
    
    const status = lifecycleStatus.toLowerCase();
    if (status.includes('transit') || status.includes('departure')) {
      return 'in_transit';
    } else if (status.includes('arrival') || status.includes('discharge')) {
      return 'at_port';
    } else if (status.includes('delivery')) {
      return 'delivered';
    } else {
      return 'active';
    }
  }

  /**
   * Map Terminal49 shipment data to our VesselPosition format
   */
  private mapToVesselPosition(shipment: Terminal49Shipment, blNumber: string): VesselPosition {
    // Find the latest position event
    let latitude: number | undefined;
    let longitude: number | undefined;
    let lastEventDate: string | undefined;

    if (shipment.events && shipment.events.length > 0) {
      // Sort events by date descending to get the latest
      const sortedEvents = shipment.events.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      for (const event of sortedEvents) {
        if (event.vessel_position?.latitude && event.vessel_position?.longitude) {
          latitude = event.vessel_position.latitude;
          longitude = event.vessel_position.longitude;
          lastEventDate = event.created_at;
          break;
        } else if (event.location?.latitude && event.location?.longitude) {
          latitude = event.location.latitude;
          longitude = event.location.longitude;
          lastEventDate = event.created_at;
          break;
        }
      }

      // If no position found, use the latest event date
      if (!lastEventDate && sortedEvents.length > 0) {
        lastEventDate = sortedEvents[0].created_at;
      }
    }

    return {
      bl_number: blNumber,
      vessel_name: shipment.vessel?.name,
      vessel_imo: shipment.vessel?.imo,
      carrier_name: shipment.carrier?.name,
      carrier_scac: shipment.carrier?.scac,
      port_of_loading: shipment.port_of_lading?.name,
      port_of_discharge: shipment.port_of_discharge?.name,
      latitude,
      longitude,
      tracking_status: this.determineTrackingStatus(shipment),
      last_event_date: lastEventDate,
      eta_pod: this.calculateETA(shipment),
      container_count: shipment.containers?.length || 1,
      // Terminal49 Map embedding fields
      terminal49_shipment_id: shipment.id,
      terminal49_container_ids: shipment.containers?.map(c => c.number) || [],
      terminal49_last_sync: new Date().toISOString(),
    };
  }

  /**
   * Determine tracking status based on Terminal49 events
   */
  private determineTrackingStatus(shipment: Terminal49Shipment): string {
    if (!shipment.events || shipment.events.length === 0) {
      return 'pending';
    }

    const latestEvent = shipment.events.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    // Map Terminal49 event types to our status
    const eventType = latestEvent.type.toLowerCase();
    
    if (eventType.includes('departed') || eventType.includes('vessel_departure')) {
      return 'in_transit';
    } else if (eventType.includes('arrived') || eventType.includes('vessel_arrival')) {
      return 'at_port';
    } else if (eventType.includes('loaded') || eventType.includes('discharged')) {
      return 'at_port';
    } else {
      return 'in_transit';
    }
  }

  /**
   * Calculate estimated time of arrival
   */
  private calculateETA(shipment: Terminal49Shipment): string | undefined {
    // Terminal49 should provide ETA in their data
    // For now, return undefined - this would need to be implemented based on their API response
    return undefined;
  }

  /**
   * Return mock data for development when Terminal49 API is not available
   */
  private getMockVesselData(blNumber: string): VesselPosition {
    // Generate consistent mock data based on BL number
    const hash = this.simpleHash(blNumber);
    
    const mockLocations = [
      { lat: 22.3193, lng: 114.1694, port: 'Hong Kong', vessel: 'COSCO SHIPPING ROSE' },
      { lat: 1.2966, lng: 103.7764, port: 'Singapore', vessel: 'EVER GIVEN' },
      { lat: 31.2304, lng: 121.4737, port: 'Shanghai', vessel: 'MSC OSCAR' },
      { lat: 35.1796, lng: 129.0756, port: 'Busan', vessel: 'MAERSK ESSEX' },
      { lat: 34.6937, lng: 135.5023, port: 'Osaka', vessel: 'CMA CGM MARCO POLO' },
    ];

    const location = mockLocations[hash % mockLocations.length];
    
    const mockCarriers = ['CMA CGM', 'Maersk', 'COSCO', 'MSC', 'Evergreen'];
    const carrier = mockCarriers[hash % mockCarriers.length];

    return {
      bl_number: blNumber,
      vessel_name: location.vessel,
      vessel_imo: `${9000000 + (hash % 999999)}`,
      carrier_name: carrier,
      carrier_scac: carrier.substring(0, 4).toUpperCase(),
      port_of_loading: 'Douala, Cameroon',
      port_of_discharge: location.port,
      latitude: location.lat + (Math.random() - 0.5) * 0.1, // Add small random offset
      longitude: location.lng + (Math.random() - 0.5) * 0.1,
      tracking_status: 'in_transit',
      last_event_date: new Date().toISOString(),
      eta_pod: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      container_count: 1 + (hash % 3), // 1-3 containers
      // Add Terminal49 mock data for testing
      terminal49_shipment_id: `shipment_${hash.toString(16)}`,
      terminal49_container_ids: [`CONT${hash.toString(16).toUpperCase().padStart(8, '0')}`],
      terminal49_last_sync: new Date().toISOString(),
    };
  }

  /**
   * Get available shipment data based on Terminal49 API tier
   * Standard tier: Basic shipment info, ports, vessel names
   * Premium tier: Adds coordinates, real-time tracking, future positions
   */
  public getAvailableDataForTier(tier: 'standard' | 'premium' = 'standard'): string[] {
    const standardData = [
      'Bill of Lading number',
      'Vessel name and IMO',
      'Carrier name and SCAC',
      'Port names (loading/discharge)',
      'Container numbers',
      'Shipment status',
      'Event timestamps'
    ];

    const premiumData = [
      ...standardData,
      'Vessel coordinates (latitude/longitude)',
      'Real-time position tracking',
      'Future position predictions',
      'Detailed route visualization',
      'Transport event coordinates'
    ];

    return tier === 'premium' ? premiumData : standardData;
  }

  /**
   * Describe what data is available based on API response
   */
  public describeAvailableData(vesselData: VesselPosition): { hasCoordinates: boolean, message: string } {
    // Check if we have actual coordinates
    if (vesselData.latitude && vesselData.longitude) {
      return {
        hasCoordinates: true,
        message: 'Vessel coordinates are available in the API response'
      };
    }

    // No coordinates in response
    return {
      hasCoordinates: false,
      message: 'Vessel coordinates not included in Terminal49 API response. Contact Terminal49 support to inquire about accessing coordinate data.'
    };
  }

  /**
   * Get user-friendly message about missing coordinates
   */
  public getCoordinateAvailabilityMessage(): string {
    return `Vessel coordinates are not included in the Terminal49 API response for this shipment. 
Based on our API testing:
• The shipment data includes vessel names, ports, and status
• Transport events are accessible but don't contain coordinates
• To get vessel position data, please contact Terminal49 support at support@terminal49.com`;
  }

  /**
   * Simple hash function to generate consistent mock data
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Track vessel by B/L number - wrapper for trackShipment for backward compatibility
   */
  async trackVessel(blNumber: string): Promise<VesselTrackingData | null> {
    const vesselPosition = await this.trackShipment(blNumber);
    
    if (!vesselPosition) {
      return null;
    }

    // Map VesselPosition to VesselTrackingData format
    return {
      bl_number: vesselPosition.bl_number,
      vessel_name: vesselPosition.vessel_name,
      vessel_imo: vesselPosition.vessel_imo,
      carrier_name: vesselPosition.carrier_name,
      status: vesselPosition.tracking_status,
      pol_name: vesselPosition.port_of_loading,
      pod_name: vesselPosition.port_of_discharge,
      current_location: vesselPosition.latitude && vesselPosition.longitude 
        ? `${vesselPosition.latitude}°, ${vesselPosition.longitude}°`
        : undefined,
      eta: vesselPosition.eta_pod,
      container_count: vesselPosition.container_count,
      last_update: vesselPosition.terminal49_last_sync,
    };
  }
}

// Add the VesselTrackingData interface at the module level
export interface VesselTrackingData {
  bl_number: string;
  vessel_name?: string;
  vessel_imo?: string;
  carrier_name?: string;
  status?: string;
  pol_name?: string; // Port of Loading
  pod_name?: string; // Port of Discharge
  current_location?: string;
  eta?: string;
  container_count?: number;
  last_update?: string;
}

export const terminal49Service = new Terminal49Service();
export default terminal49Service;