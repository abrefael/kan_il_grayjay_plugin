// ====================================================
// KAN Israel (kan.org.il) – Grayjay Extractor Template
// Shows + Podcasts
// ====================================================

const BASE = "https://www.kan.org.il";

// ====================================================
// Plugin info
// ====================================================

function getPluginInfo() {
    return {
        id: "il.kan",
        name: "KAN Israel (Template)",
        version: "0.3.0",
        author: "YourName",
        description: "Template plugin for KAN shows & podcasts."
    };
}


// ====================================================
// Discover (top-level menu)
// ====================================================

async function discover() {
    return [
        { id: "shows_root", title: "תוכניות טלוויזיה", type: "directory" },
        { id: "podcasts_root", title: "פודקאסטים", type: "directory" }
    ];
}


// ====================================================
// Explore (list shows, list podcasts, list episodes)
// ====================================================

async function explore(itemId) {

    // -------------------------------------
    // SHOW LIST
    // -------------------------------------
    if (itemId === "shows_root") {
        const url = `${BASE}/lobby/kan-box/`;
        const html = await request({ url });

        const shows = parseShowList(html);

        return shows.map(show => ({
            id: `show_${show.id}`,
            title: show.title,
            thumbnail: show.thumbnail,
            type: "directory"
        }));
    }

    // -------------------------------------
    // PODCAST LIST
    // -------------------------------------
    if (itemId === "podcasts_root") {
        const url = `${BASE}/lobby/podcasts-lobby/`;
        const html = await request({ url });

        const podcasts = parsePodcastList(html);

        return podcasts.map(p => ({
            id: `pod_${p.id}`,
            title: p.title,
            thumbnail: p.thumbnail,
            type: "directory"
        }));
    }

    // -------------------------------------
    // EPISODES OF A PODCAST
    // -------------------------------------
    if (itemId.startsWith("pod_")) {
        const podId = itemId.replace("pod_", "");
        const url = `${BASE}/content/kan/podcasts/${podId}/`;
        const html = await request({ url });

        const eps = parsePodcastEpisodes(html);

        return eps.map(ep => ({
            id: `podep_${ep.id}`,
            title: ep.title,
            thumbnail: ep.thumbnail,
            type: "audio"
        }));
    }

    // -------------------------------------
    // EPISODES OF A SHOW
    // -------------------------------------
    if (itemId.startsWith("show_")) {
        const showId = itemId.replace("show_", "");
        const url = `${BASE}/content/kan/kan-11/${showId}/`;
        const html = await request({ url });

        const eps = parseShowEpisodes(html);

        return eps.map(ep => ({
            id: `episode_${ep.id}`,
            title: ep.title,
            thumbnail: ep.thumbnail,
            type: "video"
        }));
    }

    return [];
}


// ====================================================
// getItem – fetch metadata for episode
// ====================================================

async function getItem(itemId) {

    // -----------------------------
    // Video episode
    // -----------------------------
    if (itemId.startsWith("episode_")) {
        const epId = itemId.replace("episode_", "");
        const url = `${BASE}/content/kan/kan-11/${epId}/`;
        const html = await request({ url });

        return parseVideoPage(html);
    }

    // -----------------------------
    // Podcast episode
    // -----------------------------
    if (itemId.startsWith("podep_")) {
        const epId = itemId.replace("podep_", "");
        const url = `${BASE}/content/kan/podcasts/${epId}/`;
        const html = await request({ url });

        return parseAudioPage(html);
    }

    return null;
}


// ====================================================
// getStreams – return playable media URLs
// ====================================================

async function getStreams(item) {
    if (item.type === "audio") {
        return [{
            url: item.audioUrl,
            format: "audio",
            quality: "default"
        }];
    }

    if (item.type === "video") {
        return [{
            url: item.streamUrl,
            format: "hls",
            quality: "auto"
        }];
    }

    return [];
}


// ====================================================
// Utility Parsers – Implement these
// ====================================================

// HTML parsing helper
function parseHTML(str) {
    return new DOMParser().parseFromString(str, "text/html");
}

// ----------------------------------------------------
// Parse list of shows from /lobby/series/
// ----------------------------------------------------

function parseShowList(html) {
    const doc = parseHTML(html);
    const out = [];

    // Select all show cards (both types: .card-link.d-inline-block and .card.card-row...)
    const items = doc.querySelectorAll("a.card-link.d-inline-block, a.card.card-row.card-row-xs.card-link");

    items.forEach(el => {
        const href = el.getAttribute("href");
        if (!href) return;

        const id = extractIdFromUrl(href); // e.g., last segment "962212" or "694881"

        // Thumbnail
        const img = el.querySelector("img");
        const thumbnail = img?.src ?? "";
        const thumbnailUrl = thumbnail.startsWith("/") ? BASE + thumbnail : thumbnail;

        // Title
        const title = img?.alt?.trim() || img?.title?.trim() || "No title";

        // Description / details
        let desc = "";
        const details = el.querySelectorAll(".details p");
        if (details.length) {
            desc = Array.from(details).map(p => p.textContent.trim()).join(" | ");
        } else {
            // fallback for episode-style cards
            desc = el.querySelector(".card-text")?.textContent?.trim() || "";
        }

        out.push({
            id,
            title,
            description: desc,
            thumbnail: thumbnailUrl,
            url: href
        });
    });

    return out;
}


// ----------------------------------------------------
// Parse list of podcasts from /lobby/podcasts-lobby/
// ----------------------------------------------------
function parsePodcastList(html) {
    const doc = parseHTML(html);
    const out = [];

    const items = doc.querySelectorAll("a.podcast-program__item");

    items.forEach(el => {
        const href = el.getAttribute("href");
        if (!href) return;

        const id = extractIdFromUrl(href);
        const img = el.querySelector("img");
        const thumbnail = img?.src ?? "";
        const thumbnailUrl = thumbnail.startsWith("/") ? BASE + thumbnail : thumbnail;
        const title = img?.alt?.trim() || img?.title?.trim() || "No title";
        let desc = el.querySelectorAll(".podcast-program__item-hidden-text");
        if (!desc) {
            desc = "";
        }

        out.push({
            id,
            title,
            description: desc,
            thumbnail: thumbnailUrl,
            url: href
        });
    });

    return out;
}


// ----------------------------------------------------
// Parse podcast episodes from podcast page
// ----------------------------------------------------

function parsePodcastEpisodesPage(html) {
    const doc = parseHTML(html);
    const out = [];

    const items = doc.querySelectorAll("div.card.card-row");

    items.forEach(el => {
        const link = el.querySelector("a.card-body")?.getAttribute("href");
        if (!link) return;

        const id = extractIdFromUrl(link);

        const img = el.querySelector("a.card-img.card-media img");
        const thumbnail = img?.src ?? "";
        const thumbnailUrl = thumbnail.startsWith("/") ? BASE + thumbnail : thumbnail;

        const title = el.querySelector("h2.card-title")?.textContent?.trim() || "No title";
        const description = el.querySelector("div.description")?.textContent?.trim() || "";

        const durationLi = el.querySelector("ul.card-list li:not(.date-local)");
        const duration = durationLi?.textContent?.trim() || "";

        const dateLi = el.querySelector("ul.card-list li.date-local");
        const date = dateLi?.getAttribute("data-date-utc") || "";

        out.push({
            id,
            title,
            description,
            thumbnail: thumbnailUrl,
            duration,
            date,
            url: link
        });
    });

    return out;
}


async function parsePodcastEpisodes(html, baseUrl) {
    const doc = parseHTML(html);
    let episodes = parsePodcastEpisodesPage(html);

    // Find pagination links
    const paginationLinks = Array.from(doc.querySelectorAll("ul.pagination-page__list li.pagination-page__item a.pagination-page__link"))
        .map(a => a.getAttribute("href"))
        .filter(href => href && href !== baseUrl); // avoid current page

    // Remove duplicates
    const uniqueLinks = [...new Set(paginationLinks)];

    for (const pageLink of uniqueLinks) {
        const fullUrl = pageLink.startsWith("/") ? BASE + pageLink : pageLink;
        const pageHtml = await request({ url: fullUrl });
        const pageEpisodes = parsePodcastEpisodesPage(pageHtml);
        episodes = episodes.concat(pageEpisodes);
    }

    return episodes;
}



// ----------------------------------------------------
// Extract video metadata + stream URL
// ----------------------------------------------------
/**
 * @typedef {Object} VideoSource
 * @property {string} title
 * @property {string} description
 * @property {string} thumbnail
 * @property {string} mpdUrl
 * @property {number} duration
 * @property {string} publishedAt
 */

function parseVideoPage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Find JSON-LD block
    const ldJson = doc.querySelector('script[type="application/ld+json"]');
    if (!ldJson) return null;

    let data;
    try {
        data = JSON.parse(ldJson.innerText);
    } catch (e) {
        console.error("KAN: invalid JSON-LD", e);
        return null;
    }

    // Make sure it's a VideoObject
    if (!data || data["@type"] !== "VideoObject") return null;

    const title = data.name?.trim() || "KAN Video";
    const description = data.description?.trim() || "";
    const thumbnail = data.thumbnailUrl || null;
    const publishedAt = data.uploadDate || null;

    // This is the main HLS URL (Grayjay can play this directly)
    const hlsUrl = data.contentUrl;

    return {
        title,
        description,
        thumbnail,
        publishedAt,
        streams: [
            {
                url: hlsUrl,
                format: "hls",
                quality: "auto"
            }
        ]
    };
}



// ----------------------------------------------------
// Extract audio metadata + audio URL
// ----------------------------------------------------
function parseAudioPage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    const info = doc.querySelector(".audio-episode-info, .audio-player-play-btn, [data-player-src]");
    if (!info) return null;

    const src = info.getAttribute("data-player-src");   // MP3 direct link
    const title = info.getAttribute("data-player-title") 
               || doc.querySelector("h2.title")?.innerText?.trim()
               || doc.querySelector(".episode-title")?.innerText?.trim();

    const description = doc.querySelector(".podcast-content-wrapper .item-content")?.innerText?.trim();
    const thumbnail = doc.querySelector(".audio-episode-info-image-thumbnail")?.src;

    const durationEl = doc.querySelector(".podcast-content-wrapper ul li");
    const duration = durationEl ? parseDuration(durationEl.innerText) : null;

    const dateEl = doc.querySelector(".date-local");
    const publishedAt = dateEl ? dateEl.dataset.dateUtc : null;

    return {
        title,
        description,
        thumbnail,
        duration,
        publishedAt,
        streams: [
            {
                url: src,
                format: "audio/mp3",
                quality: "high"
            }
        ]
    };
}



// ----------------------------------------------------
// Helper: Extract ID/slug from URL
// You will customize this once you see real URLs.
// ----------------------------------------------------
function extractIdFromUrl(url) {
    if (!url) return "";
    return url.split("/").filter(x => x).pop();    // last non-empty segment
}

