'use strict';

const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');

// --- CONFIGURATION / KONFIGURATION ---
const TSUN_EMAIL = 'your-email@domain.com';
const TSUN_PASSWORD = 'your-password';
const POLL_INTERVAL_SECONDS = 60;      // Poll interval in seconds / Abfrageintervall in Sekunden

const BASE_URL = 'https://pro.talent-monitoring.com';
const CLIENT_ID = 'sdl_client';
const USER_AGENT = 'ja-solar/20 CFNetwork/3860.700.2 Darwin/25.6.0';

const PREFIX = '0_userdata.0.tsun.';
let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = 0;
let isLoggingIn = false;
let cachedStationId = null;

// Hash password for authentication / Passwort für die Authentifizierung hashen
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function for JJ.MM.DD HH:MM:SS format / Hilfsfunktion für das Format JJ.MM.DD HH:MM:SS
function getFormattedTimestamp() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yy}.${mm}.${dd} ${hh}:${min}:${ss}`;
}

// Initialize overarching station states / Übergeordnete Stations-Datenpunkte initialisieren
async function initBaseStates() {
    await createIfNotExists(PREFIX + 'power', 'Aktuelle PV-Leistung Gesamt / Total PV Power', 'number', 'value.power', 'W');
    await createIfNotExists(PREFIX + 'todayYield', 'Tagesertrag Gesamt / Total Daily Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'monthlyYield', 'Monatsertrag Gesamt / Total Monthly Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'yearlyYield', 'Jahresertrag Gesamt / Total Yearly Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'totalYield', 'Gesamtertrag Gesamt / Total Lifetime Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'soc', 'Durchschnittlicher Batterie SoC / Average Battery SoC', 'number', 'value.battery', '%');
    await createIfNotExists(PREFIX + 'batteryPower', 'Batterie Leistung Gesamt / Total Battery Power', 'number', 'value.power', 'W');
    await createIfNotExists(PREFIX + 'remainingCapacity', 'Verbleibende Batterie-Energie Gesamt / Total Remaining Battery Energy', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'online', 'Verbindungsstatus / Connection Status', 'boolean', 'indicator', '');
    await createIfNotExists(PREFIX + 'lastUpdate', 'Letztes Cloud-Update / Last Cloud Update', 'string', 'date', '');
    await createIfNotExists(PREFIX + 'chargeUploadTotal', 'Gesamtladung (Lifetime) / Total Charge (Lifetime)', 'number', 'value.energy', 'kWh');
    await createIfNotExists(PREFIX + 'dischargeUploadTotal', 'Gesamtentladung (Lifetime) / Total Discharge (Lifetime)', 'number', 'value.energy', 'kWh');
}

// Initialize bilingual device states / Bilingual Gerätedatenpunkte initialisieren
async function createDeviceStates(devicePrefix) {
    // Battery / Batterie
    await createIfNotExists(devicePrefix + 'battery.soc', 'Batterie SoC / Battery SoC', 'number', 'value.battery', '%');
    await createIfNotExists(devicePrefix + 'battery.power', 'Batterie Leistung / Battery Power', 'number', 'value.power', 'W');
    await createIfNotExists(devicePrefix + 'battery.voltage', 'Batterie Spannung / Battery Voltage', 'number', 'value.voltage', 'V');
    await createIfNotExists(devicePrefix + 'battery.current', 'Batterie Strom / Battery Current', 'number', 'value.current', 'A');
    await createIfNotExists(devicePrefix + 'battery.tempMin', 'Batterie Min Temperatur / Battery Min Temperature', 'number', 'value.temperature', '°C');
    await createIfNotExists(devicePrefix + 'battery.tempMax', 'Batterie Max Temperatur / Battery Max Temperature', 'number', 'value.temperature', '°C');
    await createIfNotExists(devicePrefix + 'battery.soh', 'State of Health (SOH) / State of Health (SOH)', 'number', 'value', '%');
    await createIfNotExists(devicePrefix + 'battery.remainingAh', 'Verbleibende Kapazität / Remaining Capacity', 'number', 'value', 'Ah');
    await createIfNotExists(devicePrefix + 'battery.totalAh', 'Gesamtkapazität / Total Capacity', 'number', 'value', 'Ah');
    await createIfNotExists(devicePrefix + 'battery.dod', 'Depth of Discharge (DoD) / Depth of Discharge (DoD)', 'number', 'value', '%');
    await createIfNotExists(devicePrefix + 'battery.maxCellVoltage', 'Max. Zellspannung / Max. Cell Voltage', 'number', 'value.voltage', 'mV');
    await createIfNotExists(devicePrefix + 'battery.minCellVoltage', 'Min. Zellspannung / Min. Cell Voltage', 'number', 'value.voltage', 'mV');
    await createIfNotExists(devicePrefix + 'battery.dailyCharge', 'Tagesladung Batterie / Daily Battery Charge', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'battery.totalCharge', 'Gesamtladung Batterie / Total Battery Charge', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'battery.dailyDischarge', 'Tagesentladung Batterie / Daily Battery Discharge', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'battery.totalDischarge', 'Gesamtentladung Batterie / Total Battery Discharge', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'battery.workMode', 'Arbeitsmodus / Work Mode', 'string', 'text', '');
    await createIfNotExists(devicePrefix + 'battery.batterySn', 'Batterie Seriennummer / Battery Serial Number', 'string', 'text', '');

    // PV Total & Inputs (PV1 / PV2) / PV Gesamt & Eingänge
    await createIfNotExists(devicePrefix + 'pv.totalInputPower', 'PV Gesamtleistung DCU / Total DCU PV Power', 'number', 'value.power', 'W');
    await createIfNotExists(devicePrefix + 'pv.dailyYield', 'Tagesertrag DCU / DCU Daily Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'pv.totalYield', 'Gesamtertrag DCU / DCU Total Yield', 'number', 'value.energy', 'kWh');
    await createIfNotExists(devicePrefix + 'pv.inputMode', 'PV Eingangsmodus / PV Input Mode', 'string', 'text', '');

    for (let i = 1; i <= 2; i++) {
        await createIfNotExists(devicePrefix + `pv.pv${i}Power`, `PV ${i} Leistung / PV ${i} Power`, 'number', 'value.power', 'W');
        await createIfNotExists(devicePrefix + `pv.pv${i}Voltage`, `PV ${i} Spannung / PV ${i} Voltage`, 'number', 'value.voltage', 'V');
        await createIfNotExists(devicePrefix + `pv.pv${i}Current`, `PV ${i} Strom / PV ${i} Current`, 'number', 'value.current', 'A');
        await createIfNotExists(devicePrefix + `pv.pv${i}Temp`, `PV ${i} Temperatur / PV ${i} Temperature`, 'number', 'value.temperature', '°C');
        await createIfNotExists(devicePrefix + `pv.pv${i}Status`, `PV ${i} Status / PV ${i} Status`, 'string', 'text', '');
    }

    // Output (to inverter) / Ausgang (zum Wechselrichter)
    await createIfNotExists(devicePrefix + 'output.voltage', 'Ausgangsspannung / Output Voltage', 'number', 'value.voltage', 'V');
    await createIfNotExists(devicePrefix + 'output.current', 'Ausgangsstrom / Output Current', 'number', 'value.current', 'A');
    await createIfNotExists(devicePrefix + 'output.power', 'Ausgangsleistung / Output Power', 'number', 'value.power', 'W');
    await createIfNotExists(devicePrefix + 'output.status', 'Ausgangsstatus / Output Status', 'string', 'text', '');

    // System & Logger / System & Logger
    await createIfNotExists(devicePrefix + 'system.wifiSignal', 'WiFi Signalstärke / WiFi Signal Strength', 'number', 'value', 'dBm');
    await createIfNotExists(devicePrefix + 'system.deviceType', 'Gerätetyp / Device Type', 'string', 'text', '');
    await createIfNotExists(devicePrefix + 'system.firmware', 'Firmware Version / Firmware Version', 'string', 'text', '');
    await createIfNotExists(devicePrefix + 'system.lastDeviceTime', 'Letzter Geräte-Zeitstempel / Last Device Timestamp', 'string', 'date', '');
}

async function createIfNotExists(id, name, type, role, unit) {
    if (!(await existsStateAsync(id))) {
        await createStateAsync(id, {
            name: name,
            type: type,
            role: role,
            unit: unit,
            read: true,
            write: false
        });
    }
}

// Ensure valid OAuth token / Gültiges OAuth-Token sicherstellen
async function ensureToken() {
    const now = Date.now() / 1000;
    if (accessToken && now < tokenExpiresAt) {
        return true;
    }

    if (isLoggingIn) {
        while (isLoggingIn) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return accessToken !== null;
    }

    isLoggingIn = true;
    try {
        let payload;
        if (refreshToken) {
            payload = querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: CLIENT_ID
            });
        } else {
            payload = querystring.stringify({
                grant_type: 'password',
                username: TSUN_EMAIL,
                password: hashPassword(TSUN_PASSWORD),
                client_id: CLIENT_ID,
                identity_type: 2,
                system: 'TSUN'
            });
        }

        const response = await axios.post(`${BASE_URL}/oauth2-s/oauth/token`, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT
            }
        });

        if (response.data && response.data.access_token) {
            accessToken = response.data.access_token;
            refreshToken = response.data.refresh_token || refreshToken;
            tokenExpiresAt = now + (response.data.expires_in || 3600) - 300;
            log('TSUN Login successful / erfolgreich.', 'info');
            isLoggingIn = false;
            return true;
        } else {
            log('TSUN Login unexpected response / unerwartete Antwort: ' + JSON.stringify(response.data), 'warn');
            isLoggingIn = false;
            return false;
        }
    } catch (error) {
        log('TSUN Login connection error / Verbindungsfehler: ' + (error.response ? JSON.stringify(error.response.data) : error.message), 'error');
        refreshToken = null;
        accessToken = null;
        isLoggingIn = false;
        return false;
    }
}

// Get station ID dynamically / Stations-ID dynamisch ermitteln
async function getStationId(headers) {
    if (cachedStationId) return cachedStationId;

    try {
        const body = {
            region: { nationId: null, level1: null, level2: null, level3: null, level4: null, level5: null },
            returnTag: true,
            powerTypeList: null
        };

        const res = await axios.post(
            `${BASE_URL}/station-s/station/query/list?order.direction=ASC&order.property=name&page=1&size=9999`,
            body,
            { headers }
        );

        const items = res.data?.data || [];
        const stations = items.map(item => item.station).filter(s => s !== undefined);

        if (stations.length > 0) {
            cachedStationId = stations[0].id || stations[0].stationId;
            log(`TSUN Station detected ID / Station ermittelt ID: ${cachedStationId}`, 'info');
            return cachedStationId;
        }
    } catch (error) {
        log('Error getting station ID / Fehler beim Ermitteln der Stations-ID: ' + (error.response ? JSON.stringify(error.response.data) : error.message), 'error');
    }
    return null;
}

// Main data fetching routine / Haupt-Datenabruf
async function fetchTsunData() {
    const loggedIn = await ensureToken();
    if (!loggedIn) return;

    try {
        const headers = {
            'Authorization': `bearer ${accessToken}`,
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*'
        };

        const stationId = await getStationId(headers);
        if (!stationId) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();

        // 1. Fetch overarching station flow statistics / Übergeordnete Stations-Flow-Daten abrufen
        const flowUrl = `${BASE_URL}/station-s/station/statistic/current/flow/${stationId}?year=${year}&month=${month}&day=${day}`;
        const resFlow = await axios.get(flowUrl, { headers });
        const flow = resFlow.data?.stationCurrentDto || resFlow.data?.data || resFlow.data;

        if (flow) {
            setState(PREFIX + 'power', flow.generationPower || 0, true);
            setState(PREFIX + 'todayYield', flow.generationValue || 0, true);
            setState(PREFIX + 'monthlyYield', flow.generationValueMonth || 0, true);
            setState(PREFIX + 'yearlyYield', flow.generationValueYear || 0, true);
            setState(PREFIX + 'totalYield', flow.generationUploadTotal || 0, true);
            setState(PREFIX + 'soc', flow.batterySoc !== undefined ? flow.batterySoc : 0, true);
            setState(PREFIX + 'batteryPower', flow.batteryPower || 0, true);
            setState(PREFIX + 'remainingCapacity', flow.remainingCapacity || 0, true);
            setState(PREFIX + 'chargeUploadTotal', flow.chargeUploadTotal || 0, true);
            setState(PREFIX + 'dischargeUploadTotal', flow.dischargeUploadTotal || 0, true);
            setState(PREFIX + 'online', flow.networkStatus !== 'ALL_OFFLINE', true);
            setState(PREFIX + 'lastUpdate', getFormattedTimestamp(), true);
        }

        // 2. Fetch all station devices and filter by type 3 (DCU storage units) / Alle Geräte abrufen und nach Typ 3 filtern
        const devRes = await axios.get(`${BASE_URL}/station-s/${stationId}/device/common?page=1&size=200`, { headers });
        const devices = devRes.data?.data || devRes.data || [];

        for (const device of devices) {
            if (device.deviceType !== 3 || !device.deviceSn) {
                continue;
            }

            const deviceId = device.deviceId || device.id;
            const serialNumber = device.deviceSn;
            const devicePrefix = PREFIX + `devices.${serialNumber}.`;

            await createDeviceStates(devicePrefix);

            const deviceDataPayload = {
                language: "en",
                siteId: String(stationId),
                deviceId: String(deviceId),
                needRealTimeDataFlag: true,
                tag: "version"
            };

            try {
                const resDev = await axios.post(`${BASE_URL}/device-s/device-monitor/current-data`, deviceDataPayload, { headers });
                const devData = resDev.data || {};
                const categories = devData.paramCategoryList || [];

                // Helper to get storage value by storageName / Hilfsfunktion zum Auslesen über storageName
                const getStorageVal = (storageName) => {
                    for (const cat of categories) {
                        const fields = cat.fieldList || [];
                        const found = fields.find(f => f.storageName === storageName);
                        if (found) return found.value;
                    }
                    return null;
                };

                // Battery states / Batterie-Zustände
                setState(devicePrefix + 'battery.soc', parseFloat(getStorageVal('BT_SOC') || 0), true);
                setState(devicePrefix + 'battery.power', parseFloat(getStorageVal('BAT_P') || 0), true);
                setState(devicePrefix + 'battery.voltage', parseFloat(getStorageVal('BAT_V') || 0), true);
                setState(devicePrefix + 'battery.current', parseFloat(getStorageVal('BAT_C') || 0), true);
                setState(devicePrefix + 'battery.tempMin', parseFloat(getStorageVal('BAT_MIN_T') || 0), true);
                setState(devicePrefix + 'battery.tempMax', parseFloat(getStorageVal('BAT_MAX_T') || 0), true);
                setState(devicePrefix + 'battery.soh', parseFloat(getStorageVal('BAT_P1_SOH') || 100), true);
                setState(devicePrefix + 'battery.remainingAh', parseFloat(getStorageVal('BAT_P1_RES_CAP') || 0), true);
                setState(devicePrefix + 'battery.totalAh', parseFloat(getStorageVal('BAT_P1_TOT_CAP') || 0), true);
                setState(devicePrefix + 'battery.dod', parseFloat(getStorageVal('D_O_D') || 80), true);
                setState(devicePrefix + 'battery.maxCellVoltage', parseFloat(getStorageVal('BAT_P1_MAX_CV') || 0), true);
                setState(devicePrefix + 'battery.minCellVoltage', parseFloat(getStorageVal('BAT_P1_MIN_CV') || 0), true);
                setState(devicePrefix + 'battery.dailyCharge', parseFloat(getStorageVal('BAT_DAY_CE') || 0), true);
                setState(devicePrefix + 'battery.totalCharge', parseFloat(getStorageVal('BAT_TOT_CE') || 0), true);
                setState(devicePrefix + 'battery.dailyDischarge', parseFloat(getStorageVal('BAT_DAY_DCE') || 0), true);
                setState(devicePrefix + 'battery.totalDischarge', parseFloat(getStorageVal('BAT_TOT_DCE') || 0), true);
                setState(devicePrefix + 'battery.workMode', String(getStorageVal('BAT_WM') || 'Normal'), true);
                setState(devicePrefix + 'battery.batterySn', String(getStorageVal('BAT_P1_SN') || ''), true);

                // PV Total & Inputs / PV Gesamt & Eingänge
                setState(devicePrefix + 'pv.totalInputPower', parseFloat(getStorageVal('TOT_PV_IN_P') || 0), true);
                setState(devicePrefix + 'pv.dailyYield', parseFloat(getStorageVal('DAY_GEN') || 0), true);
                setState(devicePrefix + 'pv.totalYield', parseFloat(getStorageVal('TOT_GEN') || 0), true);
                setState(devicePrefix + 'pv.inputMode', String(getStorageVal('PV_IN_M') || ''), true);

                setState(devicePrefix + 'pv.pv1Power', parseFloat(getStorageVal('IN_P_PV1') || 0), true);
                setState(devicePrefix + 'pv.pv1Voltage', parseFloat(getStorageVal('DC_V_PV1') || 0), true);
                setState(devicePrefix + 'pv.pv1Current', parseFloat(getStorageVal('DC_C_PV1') || 0), true);
                setState(devicePrefix + 'pv.pv1Temp', parseFloat(getStorageVal('PV1_T') || 0), true);
                setState(devicePrefix + 'pv.pv1Status', String(getStorageVal('PV1_OS') || ''), true);

                setState(devicePrefix + 'pv.pv2Power', parseFloat(getStorageVal('IN_P_PV2') || 0), true);
                setState(devicePrefix + 'pv.pv2Voltage', parseFloat(getStorageVal('DC_V_PV2') || 0), true);
                setState(devicePrefix + 'pv.pv2Current', parseFloat(getStorageVal('DC_C_PV2') || 0), true);
                setState(devicePrefix + 'pv.pv2Temp', parseFloat(getStorageVal('PV2_T') || 0), true);
                setState(devicePrefix + 'pv.pv2Status', String(getStorageVal('PV2_OS') || ''), true);

                // Output / Ausgang
                setState(devicePrefix + 'output.voltage', parseFloat(getStorageVal('PV_OUT_V') || 0), true);
                setState(devicePrefix + 'output.current', parseFloat(getStorageVal('PV_OUT_C') || 0), true);
                setState(devicePrefix + 'output.power', parseFloat(getStorageVal('PV_OUT_P') || 0), true);
                setState(devicePrefix + 'output.status', String(getStorageVal('OUT_OS') || ''), true);

                // System info / System-Informationen
                setState(devicePrefix + 'system.deviceType', String(getStorageVal('DEV_TYP') || ''), true);
                setState(devicePrefix + 'system.firmware', String(getStorageVal('SWv1') || ''), true);
                setState(devicePrefix + 'system.lastDeviceTime', String(getStorageVal('BAT_TIME') || ''), true);

                // Fetch logger / wifi signal strength (with safe zero check) / Logger- / WLAN-Signalstärke abrufen (mit Null-Prüfung)
                try {
                    const resLogger = await axios.get(`${BASE_URL}/device-s/device-monitor/get-communication/${deviceId}`, { headers });
                    const loggerInfo = resLogger.data?.data || resLogger.data;
                    if (Array.isArray(loggerInfo) && loggerInfo.length > 0) {
                        const signal = loggerInfo[0].signalStrength || loggerInfo[0].rssi;
                        if (signal !== undefined && signal !== null && signal !== 0) {
                            setState(devicePrefix + 'system.wifiSignal', signal, true);
                        }
                    }
                } catch (e) {
                    // Ignore / Ignorieren
                }

            } catch (err) {
                log(`Error fetching device details for / Fehler beim Abrufen der Gerätedetails für ${serialNumber}: ${err.message}`, 'warn');
            }
        }

        log('TSUN data successfully updated for all DCU storage units / TSUN Daten für alle DCU-Speicher erfolgreich aktualisiert.', 'info');

    } catch (error) {
        log('Error fetching TSUN data / Fehler beim Abrufen der TSUN-Daten: ' + (error.response ? JSON.stringify(error.response.data) : error.message), 'error');
        setState(PREFIX + 'online', false, true);
        accessToken = null;
    }
}

// Initialization and interval scheduling / Initialisierung und Intervall-Steuerung
initBaseStates().then(() => {
    fetchTsunData();
    setInterval(fetchTsunData, POLL_INTERVAL_SECONDS * 1000);
});
