// ── Constants ────────────────────────────────────────────────

// Render pipeline constants
export const RENDER_ORDER = { SATELLITE: 0, OVERLAY: 1, FORMATION: 2, TERRAIN: 10, ANNOTATION: 999 };
export const BASE_CLAMP_BUFFER = 5; // real-world metres below sampled terrain

// Formation colours
export const COLORS = {
    'CDDART': '#4a90d9',  // Strong blue - Dartry Limestone
    'CDGLCR': '#7ec8e3',  // Light cyan - Glencar Limestone
    'CDBNBN': '#5a6e5a',  // Dark olive-green - Benbulben Shale
    'CDLSGM': '#7a7a6e',  // Warm grey-green - Lisgorman Shale
    'CDBDRN': '#8b7b8b',  // Purple-grey - Bundoran Shale
    'CDMGRE': '#d4a843',  // Warm gold - Mullaghmore Sandstone
    'CDBLSD': '#c4956a',  // Warm orange-tan - Ballysodare Limestone
};

// Full readable names
export const NAMES = {
    'CDDART': 'Dartry Limestone',
    'CDGLCR': 'Glencar Limestone',
    'CDBNBN': 'Benbulben Shale',
    'CDLSGM': 'Lisgorman Shale',
    'CDBDRN': 'Bundoran Shale',
    'CDMGRE': 'Mullaghmore Sandstone',
    'CDBLSD': 'Ballysodare Limestone',
};

export const ROCK_TYPE = {
    'CDDART': 'Limestone',
    'CDGLCR': 'Limestone',
    'CDBNBN': 'Shale',
    'CDLSGM': 'Shale',
    'CDBDRN': 'Shale',
    'CDMGRE': 'Sandstone',
    'CDBLSD': 'Limestone',
};

// Data provenance catalogue
export const DATA_PROVENANCE = {
    categories: [
        { id: 'geology', icon: '🪨', label: 'Geology' },
        { id: 'groundwater', icon: '💧', label: 'Groundwater' },
        { id: 'geothermal', icon: '🔥', label: 'Geothermal Energy' },
        { id: 'terrain', icon: '⛰️', label: 'Terrain & Surface' },
        { id: 'geohazards', icon: '⚠️', label: 'Geohazards' },
        { id: 'resources', icon: '💎', label: 'Resources' },
        { id: 'model', icon: '🏗️', label: '3D Model' },
        { id: 'imagery', icon: '🛰️', label: 'Imagery' },
    ],
    datasets: [
        { cat: 'geology', name: 'Bedrock Structural Measurements', desc: '165 GSI strike/dip observations used as structural controls for the interpreted model', badge: 'GSI', trust: 'observed', confidence: 'high', expected: 165, varRef: 'bedrockGeolData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Bedrock/Bedrock_Geology_100K_IE26_ITM/MapServer' },
        { cat: 'geology', name: 'Verified Boreholes', desc: '6 verified deep boreholes with geological logs from GSI archives', badge: 'GSI', trust: 'observed', confidence: 'high', expected: 6, varRef: 'bedrockBhData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Bedrock/IE_GSI_Bedrock_Boreholes_Verified_50K_IE26_ITM/MapServer' },
        { cat: 'geology', name: 'Unverified Bedrock Boreholes', desc: '16 GSI unverified boreholes inside the model extent, useful as lower-confidence constraints for drilling screening', badge: 'GSI', trust: 'observed', confidence: 'medium', lineage: 'bedrock_boreholes_unverified_points.json', expected: 16, varRef: 'bedrockBhUnverifiedData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Bedrock/IE_GSI_Bedrock_Boreholes_Unverified_100K_IE26_ITM/MapServer' },
        { cat: 'geology', name: 'GSI Bedrock Cross-Section', desc: 'Official GSI bedrock cross-section line intersecting the model extent with a source PDF for geological interpretation context', badge: 'GSI', trust: 'interpreted', confidence: 'medium_high', lineage: 'bedrock_cross_sections.geojson', expected: 1, varRef: 'bedrockCrossSectionData', countExpr: d => d?.features?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Bedrock/IE_GSI_Bedrock_Geology_Cross_Sections_100k_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Karst Features', desc: '103 GSI karst feature points, with site-near features emphasised for drilling-risk screening', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'karst_features_points.json', expected: 103, varRef: 'regionalKarstData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Karst_Datasets_40K_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Groundwater Vulnerability', desc: '350 zones rated from extreme to low vulnerability to pollution', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'vulnerability_overlay.json', expected: 350, varRef: 'vulnData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Groundwater_Vulnerability_40K_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Aquifer Classification', desc: '3 aquifer zones classified by productivity and type', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'aquifer_overlay.json', expected: 3, varRef: 'aquiferData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Aquifer_Datasets_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Subsoil Permeability', desc: '379 polygons showing how easily water moves through the ground', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'subsoil_overlay.json', expected: 379, varRef: 'subsoilData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/groundwater/Subsoil_Permeability_40K_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Hydrostratigraphic Units', desc: '86 processed zones mapping underground water-bearing rock layers', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 86, varRef: 'hydrostratData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/' },
        { cat: 'groundwater', name: 'Groundwater Wells', desc: '12 site-near wells and springs used for water supply context', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 12, varRef: 'gsiData', countExpr: d => d?.groundwater_wells?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Groundwater_Wells_Springs_100K_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'Source Protection Zones', desc: '1 GSI source-protection polygon intersecting the model extent', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'source_protection_overlay.json', expected: 1, varRef: 'sourceProtectionData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Groundwater/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/MapServer' },
        { cat: 'groundwater', name: 'EPA Groundwater WFD Status', desc: '25 EPA groundwater body status polygons clipped to the Sligo assessment bbox', badge: 'EPA', trust: 'processed', confidence: 'medium_high', lineage: 'epa_groundwater_status_overlay.json', expected: 25, varRef: 'epaGwStatusData', countExpr: d => d?.length, source: 'https://gis.epa.ie/geoserver/EPA/wfs' },
        { cat: 'geothermal', name: 'Geothermal Closed Loop', desc: '477 processed areas rated for ground source heat pump suitability', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 477, varRef: 'gshpClosedData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/IE_GSI_Geothermal_Vertical_Closed_Loop_Suitability_40K_IE26_ITM/MapServer' },
        { cat: 'geothermal', name: 'Open Loop Domestic', desc: '38 processed zones rated for domestic open-loop geothermal systems', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 38, varRef: 'gshpOpenDomData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/IE_GSI_Geothermal_Open_Loop_Domestic_Suitability_100K_IE26_ITM/MapServer' },
        { cat: 'geothermal', name: 'Open Loop Commercial', desc: '64 processed zones rated for commercial open-loop geothermal systems', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 64, varRef: 'gshpOpenComData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/IE_GSI_Geothermal_Open_Loop_Commercial_Suitability_100K_IE26_ITM/MapServer' },
        { cat: 'geothermal', name: 'Thermal Conductivity', desc: '10 regional field measurements of how well bedrock conducts heat; none are inside the 15 km model extent', badge: 'GSI', trust: 'observed', confidence: 'high', expected: 10, varRef: 'thermalCondData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/IE_GSI_Geothermal_Bedrock_Thermal_Conductivity_100k_IE26_ITM/MapServer' },
        { cat: 'geothermal', name: 'Temperature at Depth', desc: '8 processed GSI downhole temperature measurement points; separate temperature grids are model-derived', badge: 'GSI', trust: 'observed', confidence: 'high', lineage: 'geothermal_temperature_points.json', expected: 8, varRef: 'tempDepthData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/IE_GSI_Geothermal_Temperature_Measurements_100k_IE26_ITM/MapServer' },
        { cat: 'geothermal', name: 'GEMINI Project Site', desc: 'Design/project marker for the SRSC pilot concept: 48 BHE boreholes and 350 kW heat pump', badge: 'Design', trust: 'design', confidence: 'medium', expected: 1, varRef: 'geminiMarkerGroup', countExpr: d => d?.children?.length, source: null },
        { cat: 'terrain', name: 'SRTM 90m DEM', desc: 'Optional local NASA SRTM-derived terrain grid; viewer falls back to live terrain/flat surface when absent', badge: 'NASA', trust: 'processed', confidence: 'medium', expected: null, varRef: 'terrainData', countExpr: d => d?.elevations ? `${d.elevations.length}×${d.elevations[0]?.length || 0}` : null, source: 'https://srtm.csi.cgiar.org/' },
        { cat: 'terrain', name: 'Quaternary Sediments', desc: '1,518 processed areas of glacial deposits, peat, and alluvium', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 1518, varRef: 'quaternaryData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Quaternary/IE_GSI_Quaternary_Sediments_50K_IE26_ITM/MapServer' },
        { cat: 'geohazards', name: 'Landslide Susceptibility', desc: '901 processed cells showing relative landslide risk across the region', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 901, varRef: 'landslideSuscData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Geohazards/' },
        { cat: 'geohazards', name: 'Landslide Locations', desc: '32 observed landslide events with dates and descriptions', badge: 'GSI', trust: 'observed', confidence: 'high', expected: 32, varRef: 'landslideLocsData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Geohazards/' },
        { cat: 'geohazards', name: 'Geotechnical Boreholes', desc: '81 official GSI geotechnical borehole points plus site-near investigation group context', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'geotech_boreholes_points.json', expected: 81, varRef: 'regionalGeotechBhData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Geotechnical/IE_GSI_Geotechnical_Boreholes_IE26_ITM/MapServer' },
        { cat: 'geohazards', name: 'GSI Site Investigation Areas', desc: '7 official GSI geotechnical investigation area centroids used as historical SI markers', badge: 'GSI', trust: 'processed', confidence: 'medium_high', lineage: 'historical_investigations.json', expected: 7, varRef: 'histInvData', countExpr: d => d?.features?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Geotechnical/IE_GSI_Geotechnical_Site_Investigations_IE26_ITM/MapServer' },
        { cat: 'resources', name: 'Mineral Locations', desc: '92 observed mineral occurrences and historic mine sites', badge: 'GSI', trust: 'observed', confidence: 'high', expected: 92, varRef: 'mineralsData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Minerals/' },
        { cat: 'resources', name: 'Geoheritage Sites', desc: '14 processed sites of geological importance for conservation and education', badge: 'GSI', trust: 'processed', confidence: 'medium_high', expected: 14, varRef: 'geoheritageData', countExpr: d => d?.length, source: 'https://gsi.geodata.gov.ie/server/rest/services/Geoheritage/' },
        { cat: 'model', name: '3D Geological Interpretation', desc: '7 Carboniferous formation surfaces interpolated from GSI contacts, structural data, boreholes, and virtual constraints', badge: 'Interpreted', trust: 'interpreted', confidence: 'medium', lineage: 'formation_surfaces.json', expected: 7, varRef: 'metadata', countExpr: d => d?.formations?.length, source: null },
        { cat: 'model', name: 'Fault Network', desc: '79 fault surfaces extruded from GSI geological linework for 3D context', badge: 'Interpreted', trust: 'interpreted', confidence: 'medium', lineage: 'faults.json', expected: 79, varRef: '_faults', countExpr: d => d, source: null },
        { cat: 'model', name: 'Borehole Array', desc: '48 synthetic GSHP design boreholes sampling the interpreted geology; not observed boreholes', badge: 'Design', trust: 'design', confidence: 'medium', lineage: 'borehole_array.json', expected: 48, varRef: 'boreholeData', countExpr: d => d?.length, source: null },
        { cat: 'model', name: 'Voxel Model', desc: '40×40×30 downsampled grid derived from the interpreted formation surfaces', badge: 'Interpreted', trust: 'interpreted', confidence: 'medium', lineage: 'voxel_model.json', expected: null, varRef: 'voxelData', countExpr: d => d ? `${d.x_grid?.length||0}×${d.y_grid?.length||0}×${d.z_grid?.length||0}` : null, source: null },
        { cat: 'imagery', name: 'ArcGIS World Imagery', desc: 'Live satellite basemap tiles draped on the 3D terrain', badge: 'Esri', trust: 'external', confidence: 'medium', expected: null, varRef: '_satLoaded', countExpr: d => d ? 'Tiles' : null, source: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' },
    ]
};

// Feature → ontology source mapping
export const FEATURE_ONTOLOGY_SOURCE_IDS = {
    formation: ['gsi_bedrock_geology', 'sommervill-2009'],
    srsc_column: ['gsi_bedrock_geology', 'sommervill-2009'],
    depthslice: ['gsi_bedrock_geology', 'sommervill-2009'],
    borehole: ['pmp-atu-training', 'sligo_feasibility_study'],
    bh_marker: ['pmp-atu-training', 'sligo_feasibility_study'],
    srsc: ['pmp-atu-training', 'sligo_feasibility_study', 'gsi-suitability-pptx'],
    gemini_site: ['pmp-atu-training', 'sligo_feasibility_study', 'gsi-suitability-pptx'],
    karst: ['gsi_karst'],
    dyetrace: ['gsi_karst'],
    karst_connection: ['gsi_karst', 'geophysics-karst'],
    gsi_well: ['gsi_gw_wells'],
    geotech: ['gsi_geotech_boreholes', 'gsi_geotech_investigations'],
    structural: ['gsi_bedrock_geology'],
    vulnerability: ['gsi_gw_vulnerability'],
    subsoil: ['gsi_subsoil_perm'],
    aquifer: ['gsi_aquifer'],
    recharge: ['gsi_gw_recharge'],
    'gshp-closed': ['gsi_closed_loop', 'gsi-suitability-pptx'],
    'gshp-open-dom': ['gsi_open_loop_domestic', 'gsi-suitability-pptx'],
    'gshp-open-com': ['gsi_open_loop_commercial', 'gsi-suitability-pptx'],
    thermal_cond: ['gsi_thermal_conductivity'],
    temp_depth: ['gsi_temperature'],
    heat_flow: ['gsi_heat_flow'],
    bedrock_geol: ['gsi_bedrock_geology'],
    bedrock_bh: ['gsi_bedrock_boreholes'],
    bedrock_bh_unverified: ['gsi_bedrock_boreholes_unverified'],
    bedrock_cross_section: ['gsi_bedrock_cross_sections'],
    landslide_loc: ['gsi_landslide_locations'],
    mineral: ['gsi_minerals'],
    hist_inv: ['gsi_geotech_investigations'],
    quaternary: ['gsi_quaternary'],
    hydrostrat: ['gsi_hydrostrat'],
    'landslide-susc': ['gsi_landslide_susceptibility'],
    geoheritage: ['gsi_geoheritage'],
};

// Overlay legend configurations
export const OVERLAY_LEGENDS = {
    vulnerability: {
        title: 'Groundwater Vulnerability',
        items: [
            ['#d73027', 'X — Rock at surface / karst'],
            ['#fc8d59', 'E — Extreme'],
            ['#fee08b', 'H — High'],
            ['#91cf60', 'M — Moderate'],
            ['#1a9850', 'L — Low'],
        ],
    },
    subsoil: {
        title: 'Subsoil Permeability',
        items: [
            ['#2166ac', 'High'],
            ['#67a9cf', 'Moderate'],
            ['#d1e5f0', 'Low'],
            ['#4575b4', 'Water'],
        ],
    },
    aquifer: {
        title: 'Aquifer Classification',
        items: [
            ['#1a9850', 'Rkc — Regional karst conduit'],
            ['#33a02c', 'Rk — Regional karstified'],
            ['#4daf4a', 'Rf — Regional fissured'],
            ['#66bd63', 'Lk — Local karstified'],
            ['#a6d96a', 'Lm — Local moderate'],
            ['#d9ef8b', 'Ll — Local zones'],
            ['#fee08b', 'Pl — Poor local'],
            ['#fdae61', 'Pu — Poor unproductive'],
        ],
    },
    'gshp-closed': {
        title: 'GSHP Closed-Loop Suitability',
        items: [
            ['#1a9850', '5 — Highly Suitable'],
            ['#66bd63', '4 — Suitable'],
            ['#fee08b', '3 — Probably Suitable'],
            ['#fdae61', '2 — Possibly Unsuitable'],
            ['#d73027', '1 — Generally Unsuitable'],
            ['#888888', '6 — Made Ground'],
        ],
    },
    'gshp-open-dom': {
        title: 'GSHP Open-Loop Domestic Suitability',
        items: [
            ['#1a9850', '5 — Highly Suitable'],
            ['#66bd63', '4 — Suitable'],
            ['#fee08b', '3 — Probably Suitable'],
            ['#fdae61', '2 — Possibly Unsuitable'],
            ['#d73027', '1 — Generally Unsuitable'],
        ],
    },
    'gshp-open-com': {
        title: 'GSHP Open-Loop Commercial Suitability',
        items: [
            ['#66bd63', '4 — Suitable'],
            ['#fee08b', '3 — Probably Suitable'],
            ['#fdae61', '2 — Possibly Unsuitable'],
            ['#d73027', '1 — Generally Unsuitable'],
        ],
    },
    'quaternary': {
        title: 'Quaternary Sediments',
        items: [
            ['#8B7355', 'Till (Bedrock Gravel)'],
            ['#D2B48C', 'Till (N. Prov Sandstone)'],
            ['#BDB76B', 'Till (Gravel/Sand)'],
            ['#556B2F', 'Glaciolacustrine'],
            ['#8B4513', 'Peat'],
            ['#BC8F8F', 'Bedrock Outcrop'],
            ['#A0522D', 'Karstified Rock'],
            ['#4682B4', 'Lake'],
        ],
    },
    'hydrostrat': {
        title: 'Hydrostratigraphic Units',
        items: [
            ['#DEB887', 'Pure Limestone'],
            ['#87CEEB', 'Karstified Limestone'],
            ['#98FB98', 'Volcanic Limestone'],
            ['#6495ED', 'Dinantian Limestone'],
            ['#FFA07A', 'Basal Clastics'],
            ['#F4A460', 'Mixed Limestone'],
            ['#FFD700', 'Namurian Sandstone'],
        ],
    },
    'landslide-susc': {
        title: 'Landslide Susceptibility',
        items: [
            ['#d73027', 'High'],
            ['#fdae61', 'Moderately High'],
            ['#fee08b', 'Moderate'],
            ['#a6d96a', 'Moderately Low'],
            ['#1a9850', 'Low'],
        ],
    },
    'geoheritage': {
        title: 'Geoheritage Sites',
        items: [
            ['#DDA0DD', 'County Geological Site'],
        ],
    },
    'recharge': {
        title: 'GW Recharge (mm/yr)',
        items: [
            ['#0571b0', 'Very High (>200)'],
            ['#92c5de', 'High (100-200)'],
            ['#f7f7f7', 'Moderate (50-100)'],
            ['#fdb863', 'Low (20-50)'],
            ['#ca0020', 'Very Low (<20)'],
        ],
    },
    'source-protection': {
        title: 'Source Protection',
        items: [
            ['#006d77', 'GSI source protection zone'],
        ],
    },
    'epa-gw-status': {
        title: 'EPA Groundwater WFD Status',
        items: [
            ['#2ca25f', 'Good'],
            ['#d73027', 'Poor'],
            ['#888888', 'Unknown / unclassified'],
        ],
    },
};
