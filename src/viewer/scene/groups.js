// ── Groups module ───────────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';

/**
 * Creates ALL THREE.Group instances, sets initial visibility,
 * adds groups to worldGroup in correct order, and stores all groups in state.
 */
export function initGroups() {
    const worldGroup = new THREE.Group();
    state.scene.add(worldGroup);

    const formationGroup = new THREE.Group();
    const faultGroup = new THREE.Group();
    formationGroup.visible = true;
    faultGroup.visible = false;
    const boreholeGroup = new THREE.Group();
    const srscGroup = new THREE.Group();
    const satelliteGroup = new THREE.Group();
    const karstGroup = new THREE.Group();
    const dyeTraceGroup = new THREE.Group();
    const gsiWellGroup = new THREE.Group();
    const geotechGroup = new THREE.Group();
    const structuralGroup = new THREE.Group();
    worldGroup.add(formationGroup, faultGroup, boreholeGroup, srscGroup, satelliteGroup);
    const vulnerabilityGroup = new THREE.Group();
    const subsoilGroup = new THREE.Group();
    const aquiferGroup = new THREE.Group();
    vulnerabilityGroup.visible = false;
    subsoilGroup.visible = false;
    aquiferGroup.visible = false;
    const gshpClosedGroup = new THREE.Group();
    const gshpOpenDomGroup = new THREE.Group();
    const gshpOpenComGroup = new THREE.Group();
    const thermalCondGroup = new THREE.Group();
    const tempDepthGroup = new THREE.Group();
    const quaternaryGroup = new THREE.Group();
    const hydrostratGroup = new THREE.Group();
    const landslideSuscGroup = new THREE.Group();
    const geoheritageGroup = new THREE.Group();
    const rechargeGroup = new THREE.Group();
    const sourceProtectionGroup = new THREE.Group();
    const epaGwStatusGroup = new THREE.Group();
    const heatFlowGroup = new THREE.Group();
    const karstConnGroup = new THREE.Group();
    const bedrockGeolGroup = new THREE.Group();
    const bedrockBhGroup = new THREE.Group();
    const bedrockBhUnverifiedGroup = new THREE.Group();
    const bedrockCrossSectionGroup = new THREE.Group();
    const landslideLocsGroup = new THREE.Group();
    const mineralsGroup = new THREE.Group();
    const histInvGroup = new THREE.Group();
    const geminiMarkerGroup = new THREE.Group();
    gshpClosedGroup.visible = false;
    gshpOpenDomGroup.visible = false;
    gshpOpenComGroup.visible = false;
    thermalCondGroup.visible = false;
    tempDepthGroup.visible = false;
    quaternaryGroup.visible = false;
    hydrostratGroup.visible = false;
    landslideSuscGroup.visible = false;
    geoheritageGroup.visible = false;
    sourceProtectionGroup.visible = false;
    epaGwStatusGroup.visible = false;
    bedrockGeolGroup.visible = false;
    bedrockBhGroup.visible = false;
    bedrockBhUnverifiedGroup.visible = false;
    bedrockCrossSectionGroup.visible = false;
    landslideLocsGroup.visible = false;
    mineralsGroup.visible = false;
    histInvGroup.visible = false;
    worldGroup.add(karstGroup, dyeTraceGroup, gsiWellGroup, geotechGroup, structuralGroup);
    worldGroup.add(vulnerabilityGroup, subsoilGroup, aquiferGroup);
    worldGroup.add(gshpClosedGroup, gshpOpenDomGroup, gshpOpenComGroup);
    worldGroup.add(thermalCondGroup, tempDepthGroup);
    worldGroup.add(quaternaryGroup, hydrostratGroup, landslideSuscGroup, geoheritageGroup, rechargeGroup);
    worldGroup.add(sourceProtectionGroup, epaGwStatusGroup);
    worldGroup.add(bedrockGeolGroup, bedrockBhGroup, bedrockBhUnverifiedGroup, bedrockCrossSectionGroup, landslideLocsGroup, mineralsGroup);
    worldGroup.add(heatFlowGroup, karstConnGroup);
    worldGroup.add(histInvGroup, geminiMarkerGroup);
    const terrainGroup = new THREE.Group();
    worldGroup.add(terrainGroup);

    const depthSliceGroup = new THREE.Group();
    const srscColumnGroup = new THREE.Group();
    const proposedSiteGroup = new THREE.Group();
    srscColumnGroup.visible = false;
    worldGroup.add(depthSliceGroup, srscColumnGroup, proposedSiteGroup);

    // Horizontal guard plane; terrain-specific fitting is handled by vertex clamping.
    const terrainClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), state.terrainClipElevation * state.currentVertExag);

    // Store all groups in state
    state.worldGroup = worldGroup;
    state.terrainClipPlane = terrainClipPlane;
    state.formationGroup = formationGroup;
    state.faultGroup = faultGroup;
    state.boreholeGroup = boreholeGroup;
    state.srscGroup = srscGroup;
    state.satelliteGroup = satelliteGroup;
    state.karstGroup = karstGroup;
    state.dyeTraceGroup = dyeTraceGroup;
    state.gsiWellGroup = gsiWellGroup;
    state.geotechGroup = geotechGroup;
    state.structuralGroup = structuralGroup;
    state.vulnerabilityGroup = vulnerabilityGroup;
    state.subsoilGroup = subsoilGroup;
    state.aquiferGroup = aquiferGroup;
    state.gshpClosedGroup = gshpClosedGroup;
    state.gshpOpenDomGroup = gshpOpenDomGroup;
    state.gshpOpenComGroup = gshpOpenComGroup;
    state.thermalCondGroup = thermalCondGroup;
    state.tempDepthGroup = tempDepthGroup;
    state.quaternaryGroup = quaternaryGroup;
    state.hydrostratGroup = hydrostratGroup;
    state.landslideSuscGroup = landslideSuscGroup;
    state.geoheritageGroup = geoheritageGroup;
    state.rechargeGroup = rechargeGroup;
    state.sourceProtectionGroup = sourceProtectionGroup;
    state.epaGwStatusGroup = epaGwStatusGroup;
    state.heatFlowGroup = heatFlowGroup;
    state.karstConnGroup = karstConnGroup;
    state.bedrockGeolGroup = bedrockGeolGroup;
    state.bedrockBhGroup = bedrockBhGroup;
    state.bedrockBhUnverifiedGroup = bedrockBhUnverifiedGroup;
    state.bedrockCrossSectionGroup = bedrockCrossSectionGroup;
    state.landslideLocsGroup = landslideLocsGroup;
    state.mineralsGroup = mineralsGroup;
    state.histInvGroup = histInvGroup;
    state.geminiMarkerGroup = geminiMarkerGroup;
    state.terrainGroup = terrainGroup;
    state.depthSliceGroup = depthSliceGroup;
    state.srscColumnGroup = srscColumnGroup;
    state.proposedSiteGroup = proposedSiteGroup;
}
