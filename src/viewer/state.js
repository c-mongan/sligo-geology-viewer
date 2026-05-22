// ── Shared mutable state ─────────────────────────────────────
// All modules read/write this single object instead of module-level lets.
// Initialised with safe defaults; setup.js populates scene/camera/renderer/controls.

export const state = {
    // Core Three.js objects (set by setup.js)
    scene: null,
    camera: null,
    renderer: null,
    controls: null,

    // Groups (set by setup.js after scene creation)
    worldGroup: null,
    formationGroup: null,
    faultGroup: null,
    boreholeGroup: null,
    srscGroup: null,
    satelliteGroup: null,
    karstGroup: null,
    dyeTraceGroup: null,
    gsiWellGroup: null,
    geotechGroup: null,
    structuralGroup: null,
    vulnerabilityGroup: null,
    subsoilGroup: null,
    aquiferGroup: null,
    gshpClosedGroup: null,
    gshpOpenDomGroup: null,
    gshpOpenComGroup: null,
    thermalCondGroup: null,
    tempDepthGroup: null,
    quaternaryGroup: null,
    hydrostratGroup: null,
    landslideSuscGroup: null,
    geoheritageGroup: null,
    rechargeGroup: null,
    sourceProtectionGroup: null,
    epaGwStatusGroup: null,
    heatFlowGroup: null,
    karstConnGroup: null,
    bedrockGeolGroup: null,
    bedrockBhGroup: null,
    bedrockBhUnverifiedGroup: null,
    bedrockCrossSectionGroup: null,
    landslideLocsGroup: null,
    mineralsGroup: null,
    histInvGroup: null,
    geminiMarkerGroup: null,
    terrainGroup: null,
    depthSliceGroup: null,
    srscColumnGroup: null,
    proposedSiteGroup: null,

    // Data (loaded at runtime)
    metadata: null,
    boreholeData: [],
    voxelData: null,
    gsiData: null,
    regionalKarstData: null,
    regionalGeotechBhData: null,
    vulnData: null,
    subsoilData: null,
    aquiferData: null,
    gshpClosedData: null,
    gshpOpenDomData: null,
    gshpOpenComData: null,
    thermalCondData: null,
    tempDepthData: null,
    quaternaryData: null,
    hydrostratData: null,
    landslideSuscData: null,
    geoheritageData: null,
    sourceProtectionData: null,
    epaGwStatusData: null,
    bedrockGeolData: null,
    bedrockBhData: null,
    bedrockBhUnverifiedData: null,
    bedrockCrossSectionData: null,
    landslideLocsData: null,
    mineralsData: null,
    terrainData: null,
    lineageManifest: null,
    projectConfig: null,
    siteAssessmentProfile: null,
    drillingRiskRegister: null,
    selectedPrognosis: null,
    heatFlowData: null,
    rechargeData: null,
    karstConnData: null,
    tempAtDepthData: null,
    histInvData: null,

    // Center coordinates (set after metadata load)
    cx: 0,
    cy: 0,

    // View state
    currentVertExag: 3,
    currentExplode: 0,

    // Clip planes (set by setup.js)
    clipPlaneEW: null,
    clipPlaneNS: null,
    terrainClipPlane: null,
    terrainClipElevation: 57,

    // Formation tracking
    allFormationMeshes: [],

    // Animation
    pulseTime: 0,

    // Internal counters / flags
    _faultCount: 0,
    _satLoaded: false,

    // Ontology / info panel
    ontologyInventory: null,
    ontologyInventoryIndex: new Map(),
    ontologyInventoryPromise: null,
    infoPanelOntologyNonce: 0,

    // Measurement tool
    measuringActive: false,

    // Satellite
    satellitePlane: null,

    // Lazy layer management
    _lazyBuilt: new Set(),
    _disposeTimers: new Map(),

    // Raycast cache
    _raycastTargetsCache: null,
    _raycastCacheVersion: 0,
};
