import dgram from "node:dgram";

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const DEFAULT_ECP_PORT = 8060;
const DISCOVERY_TIMEOUT_MS = 1500;
const REQUEST_TIMEOUT_MS = 2500;
const SEARCH_SCREEN_DELAY_MS = 700;
const KEYPRESS_DELAY_MS = 120;
const SEARCH_RESULTS_SETTLE_DELAY_MS = 900;
const MAX_TITLE_LENGTH = 80;
const TEXT_SEARCH_NAV_SEQUENCE = ["Home", "Up", "Up", "Select"];
const SEARCH_RESULTS_REFRESH_SEQUENCES = [
  [],
  ["Right", "Left"],
  ["Left", "Right"],
  ["Down", "Up"],
  ["Select"],
];
const KEYBOARD_POSITIONS = new Map([
  ["a", { row: 0, column: 0 }],
  ["b", { row: 0, column: 1 }],
  ["c", { row: 0, column: 2 }],
  ["d", { row: 0, column: 3 }],
  ["e", { row: 0, column: 4 }],
  ["f", { row: 0, column: 5 }],
  ["g", { row: 1, column: 0 }],
  ["h", { row: 1, column: 1 }],
  ["i", { row: 1, column: 2 }],
  ["j", { row: 1, column: 3 }],
  ["k", { row: 1, column: 4 }],
  ["l", { row: 1, column: 5 }],
  ["m", { row: 2, column: 0 }],
  ["n", { row: 2, column: 1 }],
  ["o", { row: 2, column: 2 }],
  ["p", { row: 2, column: 3 }],
  ["q", { row: 2, column: 4 }],
  ["r", { row: 2, column: 5 }],
  ["s", { row: 3, column: 0 }],
  ["t", { row: 3, column: 1 }],
  ["u", { row: 3, column: 2 }],
  ["v", { row: 3, column: 3 }],
  ["w", { row: 3, column: 4 }],
  ["x", { row: 3, column: 5 }],
  ["y", { row: 4, column: 0 }],
  ["z", { row: 4, column: 1 }],
  ["1", { row: 4, column: 2 }],
  ["2", { row: 4, column: 3 }],
  ["3", { row: 4, column: 4 }],
  ["4", { row: 4, column: 5 }],
  ["5", { row: 5, column: 0 }],
  ["6", { row: 5, column: 1 }],
  ["7", { row: 5, column: 2 }],
  ["8", { row: 5, column: 3 }],
  ["9", { row: 5, column: 4 }],
  ["0", { row: 5, column: 5 }],
  ["clear", { row: 6, column: 0 }],
  [" ", { row: 6, column: 2 }],
  ["backspace", { row: 6, column: 4 }],
]);

const SEARCH_BROWSE_ENDPOINTS = [
  (title, year) =>
    `/search/browse?keyword=${encodeURIComponent(title)}&mediaType=movie${year ? `&year=${encodeURIComponent(String(year))}` : ""}`,
  (title) => `/search/browse?title=${encodeURIComponent(title)}&type=movie`,
];
const MAX_APP_NAMES = ["Max", "HBO Max"];
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const STREAMING_SERVICE_APP_CANDIDATES = {
  "Max": ["Max", "HBO Max"],
  "Netflix": ["Netflix"],
  "Hulu": ["Hulu"],
  "Disney+": ["Disney Plus", "Disney+"],
  "Prime Video": ["Prime Video", "Amazon Prime Video"],
  "Apple TV+": ["Apple TV"],
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractXmlValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeTitle(title) {
  return normalizeText(title).slice(0, MAX_TITLE_LENGTH);
}

function parseAddress(input) {
  const trimmed = normalizeText(input);
  if (!trimmed) {
    throw new Error("Missing Roku address.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Invalid Roku address.");
  }

  const host = url.hostname;
  const port = Number(url.port || DEFAULT_ECP_PORT);

  if (!host || Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Invalid Roku address.");
  }

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
  };
}

async function rokuFetch(address, path, options = {}) {
  const target = typeof address === "string" ? parseAddress(address) : address;
  const url = `${target.baseUrl}${path}`;
  const method = options.method || "GET";

  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: options.headers,
    body: options.body,
  });

  if (!response.ok) {
    const error = new Error(`Roku request failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return response;
}

async function postKeypress(address, key) {
  const encodedKey = encodeURIComponent(key);
  await rokuFetch(address, `/keypress/${encodedKey}`, {
    method: "POST",
  });
}

async function sendLiteralText(address, title) {
  for (const character of title) {
    await postKeypress(address, `Lit_${character}`);
    await wait(KEYPRESS_DELAY_MS);
  }
}

function normalizeTitleForKeyboard(title) {
  return sanitizeTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function moveKeyboardCursor(address, from, to) {
  const verticalKey = to.row >= from.row ? "Down" : "Up";
  const horizontalKey = to.column >= from.column ? "Right" : "Left";

  for (let step = 0; step < Math.abs(to.row - from.row); step += 1) {
    await postKeypress(address, verticalKey);
    await wait(KEYPRESS_DELAY_MS);
  }

  for (let step = 0; step < Math.abs(to.column - from.column); step += 1) {
    await postKeypress(address, horizontalKey);
    await wait(KEYPRESS_DELAY_MS);
  }
}

async function typeWithKeyboardNavigation(address, title) {
  const normalizedTitle = normalizeTitleForKeyboard(title);
  let currentPosition = KEYBOARD_POSITIONS.get("a");

  if (!normalizedTitle) {
    throw new Error("No supported characters available for keyboard navigation.");
  }

  for (const character of normalizedTitle) {
    const nextPosition = KEYBOARD_POSITIONS.get(character);

    if (!nextPosition) {
      continue;
    }

    await moveKeyboardCursor(address, currentPosition, nextPosition);
    await postKeypress(address, "Select");
    await wait(KEYPRESS_DELAY_MS);
    currentPosition = nextPosition;
  }
}

async function runKeySequence(address, keys, delayMs = KEYPRESS_DELAY_MS) {
  for (const key of keys) {
    await postKeypress(address, key);
    await wait(delayMs);
  }
}

async function openTextSearchFromHome(address) {
  await runKeySequence(address, TEXT_SEARCH_NAV_SEQUENCE);

  await wait(SEARCH_SCREEN_DELAY_MS);
}

function parseSsdpLocation(message) {
  const match = String(message || "").match(/location:\s*(https?:\/\/[^\s]+)/i);
  return match ? match[1].trim() : "";
}

function isForbiddenRokuError(error) {
  return error?.statusCode === 403 || error?.cause?.statusCode === 403;
}

function parseInstalledApps(xml) {
  const apps = [];
  const pattern = /<app\b([^>]*)>([\s\S]*?)<\/app>/gi;
  let match;

  while ((match = pattern.exec(String(xml || "")))) {
    const attrs = match[1] || "";
    const name = normalizeText(match[2] || "");
    const idMatch = attrs.match(/\bid="([^"]+)"/i);

    if (!idMatch || !name) {
      continue;
    }

    apps.push({
      id: idMatch[1],
      name,
    });
  }

  return apps;
}

function extractMaxContentId(input) {
  const text = String(input || "").trim();
  if (!text) {
    return "";
  }

  const directMatch = text.match(UUID_PATTERN);
  if (directMatch) {
    return directMatch[0];
  }

  try {
    const url = new URL(text);
    const combined = `${url.pathname}${url.search}${url.hash}`;
    const urlMatch = combined.match(UUID_PATTERN);
    return urlMatch ? urlMatch[0] : "";
  } catch {
    return "";
  }
}

function normalizeDeviceRecord(address, xml) {
  const parsed = typeof address === "string" ? parseAddress(address) : address;
  const serialNumber = extractXmlValue(xml, "serial-number");
  const deviceId = extractXmlValue(xml, "device-id");
  const friendlyName =
    extractXmlValue(xml, "user-device-name") ||
    extractXmlValue(xml, "friendly-device-name") ||
    extractXmlValue(xml, "default-device-name") ||
    "Roku";
  const model =
    extractXmlValue(xml, "friendly-model-name") ||
    extractXmlValue(xml, "model-name") ||
    extractXmlValue(xml, "model-number");

  return {
    id: deviceId || serialNumber || `${parsed.host}:${parsed.port}`,
    name: friendlyName,
    ip: parsed.host,
    port: parsed.port,
    model: model || undefined,
  };
}

export async function getRokuDeviceInfo(input) {
  const address = parseAddress(input);

  try {
    const response = await rokuFetch(address, "/query/device-info");
    const xml = await response.text();

    return normalizeDeviceRecord(address, xml);
  } catch (error) {
    const wrapped = new Error("Unable to reach Roku device.");
    wrapped.code = "UNREACHABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function getInstalledRokuApps(input) {
  const address = parseAddress(input);

  try {
    const response = await rokuFetch(address, "/query/apps");
    const xml = await response.text();
    return parseInstalledApps(xml);
  } catch (error) {
    const wrapped = new Error("Unable to read installed Roku apps.");
    wrapped.code = "APPS_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

export function resolvePreferredStreamingLaunch({ userServices = [], movieProviders = [], installedApps = [] }) {
  const installedByName = new Map(
    installedApps.map((app) => [normalizeText(app.name).toLowerCase(), app])
  );
  const normalizedProviders = new Set(
    movieProviders.map((provider) => normalizeText(provider).toLowerCase())
  );

  for (const rawServiceName of userServices) {
    const serviceName = normalizeText(rawServiceName);

    if (!normalizedProviders.has(serviceName.toLowerCase())) {
      continue;
    }

    const appCandidates = STREAMING_SERVICE_APP_CANDIDATES[serviceName];

    if (!Array.isArray(appCandidates) || appCandidates.length === 0) {
      console.info("[roku] No Roku app mapping configured for service", { serviceName });
      continue;
    }

    for (const candidateName of appCandidates) {
      const installedApp = installedByName.get(normalizeText(candidateName).toLowerCase());
      if (installedApp) {
        return {
          serviceName,
          appId: installedApp.id,
          appName: installedApp.name,
        };
      }
    }
  }

  return null;
}

export async function launchRokuApp({ rokuIp, appId, appName, serviceName }) {
  const address = parseAddress(rokuIp);

  try {
    await rokuFetch(address, `/launch/${encodeURIComponent(appId)}`, { method: "POST" });
    console.info("[roku] App launch succeeded", {
      strategy: "launch-app",
      serviceName,
      appId,
      appName,
      ip: address.host,
    });
    return {
      ok: true,
      action: "launched-app",
      message: `Opened ${serviceName} on Roku.`,
      details: [`Used installed Roku app "${appName}" (${appId}).`],
      serviceName,
      appName,
    };
  } catch (error) {
    console.error("[roku] App launch failed", {
      serviceName,
      appId,
      appName,
      error,
    });

    if (isForbiddenRokuError(error)) {
      return {
        ok: false,
        action: "failed",
        message: "Roku rejected the app launch request.",
        details: [
          "Set Roku Settings > System > Advanced system settings > Control by mobile apps > Network access to Default or Permissive.",
        ],
      };
    }

    return {
      ok: false,
      action: "failed",
      message: `Unable to open ${serviceName} on Roku.`,
      details: [`Tried installed Roku app "${appName}" (${appId}).`],
      serviceName,
      appName,
    };
  }
}

export async function discoverRokuDevices({ timeoutMs = DISCOVERY_TIMEOUT_MS } = {}) {
  const discoveredLocations = new Set();

  try {
    await new Promise((resolve) => {
      const socket = dgram.createSocket("udp4");

      socket.on("message", (message) => {
        const location = parseSsdpLocation(message.toString());
        if (location) {
          discoveredLocations.add(location);
        }
      });

      socket.on("error", (error) => {
        console.warn("[roku] SSDP discovery error", error);
        socket.close();
        resolve();
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.setMulticastTTL(2);

        const request = [
          "M-SEARCH * HTTP/1.1",
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          'MAN: "ssdp:discover"',
          "MX: 1",
          "ST: roku:ecp",
          "",
          "",
        ].join("\r\n");

        socket.send(Buffer.from(request), SSDP_PORT, SSDP_ADDRESS, (error) => {
          if (error) {
            console.warn("[roku] Failed to send SSDP discovery request", error);
            socket.close();
            resolve();
            return;
          }

          setTimeout(() => {
            socket.close();
            resolve();
          }, timeoutMs);
        });
      });
    });
  } catch (error) {
    console.warn("[roku] SSDP discovery unavailable", error);
    return [];
  }

  const devices = await Promise.all(
    [...discoveredLocations].map(async (location) => {
      try {
        return await getRokuDeviceInfo(location);
      } catch (error) {
        console.warn("[roku] Failed to read discovered Roku info", { location, error });
        return null;
      }
    })
  );

  return devices.filter(Boolean);
}

export async function openSearchForTitle({ rokuIp, title, year }) {
  const address = parseAddress(rokuIp);
  const sanitizedTitle = sanitizeTitle(title);

  if (!sanitizedTitle) {
    throw new Error("Missing movie title.");
  }

  const details = [];
  let deviceInfo;

  try {
    deviceInfo = await getRokuDeviceInfo(`${address.host}:${address.port}`);
    details.push(`Connected to ${deviceInfo.name}${deviceInfo.model ? ` (${deviceInfo.model})` : ""}.`);
  } catch (error) {
    console.error("[roku] Device info lookup failed", error);
    return {
      ok: false,
      action: "failed",
      message: "Could not reach that Roku on your local network.",
      details: [
        "Check that the Roku IP is correct.",
        "Make sure Control by mobile apps is enabled on the Roku.",
      ],
    };
  }

  try {
    await openTextSearchFromHome(address);
  } catch (error) {
    console.error("[roku] Failed to open Roku search screen", error);

    if (isForbiddenRokuError(error)) {
      return {
        ok: false,
        action: "failed",
        message: "Roku rejected the control request.",
        details: [
          ...details,
          "Set Roku Settings > System > Advanced system settings > Control by mobile apps > Network access to Default or Permissive.",
          "Retry after changing the setting or restarting the Roku.",
        ],
      };
    }

    return {
      ok: false,
      action: "failed",
      message: "The Roku responded, but text search could not be opened automatically.",
      details: [
        ...details,
        "This fallback expects the Roku home screen search item to be two Up presses above the default focus.",
        "If your home screen focus moved, return to the Roku home screen and retry.",
      ],
    };
  }

  try {
    await typeWithKeyboardNavigation(address, sanitizedTitle);
  } catch (error) {
    console.warn("[roku] Roku search text entry failed", error);
    return {
      ok: true,
      action: "opened-search-fallback",
      message: `Opened Roku search, but text entry fell back on "${sanitizedTitle}".`,
      details: [
        ...details,
        "The Roku search screen should now be open.",
        "If the title was not entered automatically, finish the last step with the Roku remote.",
      ],
    };
  }

  await wait(SEARCH_RESULTS_SETTLE_DELAY_MS);

  for (const [index, refreshSequence] of SEARCH_RESULTS_REFRESH_SEQUENCES.entries()) {
    try {
      await runKeySequence(address, refreshSequence);
      await wait(SEARCH_RESULTS_SETTLE_DELAY_MS);

      console.info("[roku] Search strategy succeeded", {
        strategy: "keyboard-navigation-search",
        refreshSequence,
        refreshSequenceIndex: index,
        ip: address.host,
      });

      return {
        ok: true,
        action: "opened-search",
        message: `Opened Roku search for "${sanitizedTitle}".`,
        details: [
          ...details,
          "Assumed the Roku started on the home screen.",
          "Used Roku home navigation plus on-screen keyboard navigation to type the title.",
          refreshSequence.length > 0
            ? `Applied a post-typing refresh step: ${refreshSequence.join(" -> ")}.`
            : "Used the default post-typing settle delay with no extra refresh step.",
        ],
      };
    } catch (error) {
      console.warn("[roku] Post-typing refresh step failed", {
        refreshSequence,
        refreshSequenceIndex: index,
        error,
      });
    }
  }

  return {
    ok: true,
    action: "opened-search-fallback",
    message: `Opened Roku search for "${sanitizedTitle}", but results may need a manual refresh.`,
    details: [
      ...details,
      "Assumed the Roku started on the home screen.",
      "The title was typed successfully, but the Roku did not confirm a results refresh from the automated follow-up steps.",
    ],
  };
}

export async function launchMaxContent({ rokuIp, maxContentInput, title }) {
  const address = parseAddress(rokuIp);
  const contentId = extractMaxContentId(maxContentInput);
  const displayTitle = sanitizeTitle(title) || "the selected title";

  if (!contentId) {
    return {
      ok: false,
      action: "failed",
      message: "Enter a valid Max URL or Max content ID.",
      details: [
        "Paste a Max URL that contains the title UUID, or paste the UUID directly.",
      ],
    };
  }

  let apps;

  try {
    apps = await getInstalledRokuApps(`${address.host}:${address.port}`);
  } catch (error) {
    console.error("[roku] Failed to query installed apps", error);
    return {
      ok: false,
      action: "failed",
      message: "Could not read the installed Roku apps.",
      details: [
        "Check the Roku IP and confirm mobile app control is enabled.",
      ],
    };
  }

  const maxApp = apps.find((app) => MAX_APP_NAMES.includes(app.name));

  if (!maxApp) {
    return {
      ok: false,
      action: "failed",
      message: "Max is not installed on this Roku.",
      details: [
        "Install Max on the Roku and try again.",
      ],
    };
  }

  try {
    await rokuFetch(
      address,
      `/launch/${encodeURIComponent(maxApp.id)}?contentID=${encodeURIComponent(contentId)}&mediaType=movie`,
      { method: "POST" }
    );
    console.info("[roku] Launch strategy succeeded", {
      strategy: "max-direct-launch",
      appId: maxApp.id,
      appName: maxApp.name,
      contentId,
      ip: address.host,
    });
    return {
      ok: true,
      action: "launched-max",
      message: `Launched Max for "${displayTitle}".`,
      details: [
        `Used installed Roku app "${maxApp.name}" (${maxApp.id}).`,
        `Used Max content ID ${contentId}.`,
      ],
    };
  } catch (error) {
    console.error("[roku] Max launch failed", {
      contentId,
      appId: maxApp.id,
      error,
    });

    if (isForbiddenRokuError(error)) {
      return {
        ok: false,
        action: "failed",
        message: "Roku rejected the Max launch request.",
        details: [
          "Set Roku Settings > System > Advanced system settings > Control by mobile apps > Network access to Default or Permissive.",
        ],
      };
    }

    return {
      ok: false,
      action: "failed",
      message: "Max did not accept that launch request.",
      details: [
        `The installed Roku app was "${maxApp.name}" (${maxApp.id}).`,
        "Double-check that the pasted Max URL or content ID matches the title you want.",
      ],
    };
  }
}
