// ============================
// KAN Grayjay Plugin (no-npm fallbacks)
// ============================

(function() {
    const BASE = "https://www.kan.org.il";

    // ----------------------------
    // Environment fallbacks (no npm required)
    // - fetch: use native fetch or XHR-based polyfill when available
    // - DOMParser: use native DOMParser or document.implementation.createHTMLDocument
    // ----------------------------
    if (typeof fetch === "undefined") {
        if (typeof XMLHttpRequest !== "undefined") {
            globalThis.fetch = function(url, options) {
                return new Promise((resolve, reject) => {
                    try {
                        const xhr = new XMLHttpRequest();
                        const method = (options && options.method) || "GET";
                        xhr.open(method, url, true);

                        if (options && options.headers) {
                            try {
                                const headers = options.headers;
                                if (headers.forEach) {
                                    headers.forEach((v, k) => xhr.setRequestHeader(k, v));
                                } else {
                                    for (const k in headers) {
                                        if (Object.prototype.hasOwnProperty.call(headers, k)) {
                                            xhr.setRequestHeader(k, headers[k]);
                                        }
                                    }
                                }
                            } catch (e) {
                                // ignore header setting errors
                            }
                        }

                        xhr.onreadystatechange = function() {
                            if (xhr.readyState === 4) {
                                const status = xhr.status === 1223 ? 204 : xhr.status; // weird IE quirk
                                const ok = status >= 200 && status < 300;
                                const responseText = xhr.responseText;
                                resolve({
                                    ok: ok,
                                    status: status,
                                    text: () => Promise.resolve(responseText),
                                    json: () => {
                                        try {
                                            return Promise.resolve(JSON.parse(responseText));
                                        } catch (e) {
                                            return Promise.reject(e);
                                        }
                                    },
                                    // minimal headers object
                                    headers: {
                                        get: function() { return null; }
                                    }
                                });
                            }
                        };
                        xhr.onerror = function() {
                            reject(new TypeError("Network request failed"));
                        };
                        xhr.send(options && options.body ? options.body : null);
                    } catch (e) {
                        reject(e);
                    }
                });
            };
            console.log("KAN: fetch fallback using XMLHttpRequest");
        } else {
            console.warn("KAN: fetch is not available and XMLHttpRequest fallback is not possible");
        }
    }

    if (typeof DOMParser === "undefined") {
        if (typeof document !== "undefined" && document.implementation && typeof document.implementation.createHTMLDocument === "function") {
            globalThis.DOMParser = class {
                parseFromString(str /*, contentType */) {
                    // create a fresh HTML document and set its contents
                    const doc = document.implementation.createHTMLDocument("");
                    // Some content includes <html> etc; set documentElement.innerHTML when possible
                    try {
                        // For full HTML string, assign to documentElement.outerHTML gives problems,
                        // so try to parse by writing into body if present
                        const bodyMatch = str.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                        if (bodyMatch) {
                            doc.body.innerHTML = bodyMatch[1];
                        } else {
                            // No explicit body: place entire string inside documentElement
                            doc.documentElement.innerHTML = str;
                        }
                    } catch (e) {
                        // As fallback, put raw string into a div and return its document
                        const wrapper = document.createElement("div");
                        wrapper.innerHTML = str;
                        // create a minimal doc-like object with querySelectorAll
                        return wrapper;
                    }
                    return doc;
                }
            };
            console.log("KAN: DOMParser fallback using document.implementation.createHTMLDocument");
        } else {
            console.warn("KAN: DOMParser is not available and document-based fallback is not possible");
        }
    }

    // ----------------------------
    // Utility: fetch HTML -> returns Document
    // ----------------------------
    async function fetchHtml(url) {
        try {
            const res = await fetch(url);
            console.log("KAN: fetch", url, "status", res.status);
            if (!res.ok) throw new Error("HTTP error " + res.status);
            const text = await res.text();
            console.log("KAN: fetched HTML length", text.length);
            // If fetch returned a Document already (unlikely), pass through
            if (text && typeof text !== "string" && text.querySelector) return text;
            return new DOMParser().parseFromString(text, "text/html");
        } catch (e) {
            console.error("KAN: fetchHtml error", e, url);
            return null;
        }
    }

    // ----------------------------
    // Utility: parse duration like "29 דקות"
    // ----------------------------
    function parseDuration(text) {
        if (!text) return null;
        const match = text.match(/(\d+)\s*דקות/);
        return match ? parseInt(match[1], 10) * 60 : null;
    }

    // ----------------------------
    // Parse shows list
    // ----------------------------
    function parseShowList(doc) {
        if (!doc) return [];
        const items = Array.from(doc.querySelectorAll(".card-link.d-inline-block"));
        const results = items.map(a => ({
            title: a.querySelector(".card-body .details p")?.innerText?.trim() || a.querySelector("img")?.alt,
            pageUrl: a.href,
            thumbnail: a.querySelector("img")?.src || null,
            description: a.querySelector(".details p")?.innerText?.trim() || "",
        }));
        console.log("KAN: parsed shows", results.length);
        return results;
    }

    // ----------------------------
    // Parse podcast episodes list
    // ----------------------------
    function parsePodcastEpisodes(doc) {
        if (!doc) return [];
        const cards = Array.from(doc.querySelectorAll(".card.card-row"));
        const results = cards.map(card => {
            const title = card.querySelector(".card-title")?.innerText?.trim();
            const description = card.querySelector(".description")?.innerText?.trim();
            const thumbnail = card.querySelector("img")?.src;
            const duration = parseDuration(card.querySelector("ul.card-list li")?.innerText);
            const dateEl = card.querySelector(".date-local");
            const publishedAt = dateEl ? dateEl.dataset.dateUtc : null;
            const link = card.querySelector("a.card-img")?.href;
            return { title, description, thumbnail, duration, publishedAt, pageUrl: link };
        });
        console.log("KAN: parsed podcast episodes", results.length);
        return results;
    }

    // ----------------------------
    // Parse a video page (JSON-LD) — accepts Document
    // ----------------------------
    async function parseVideoPage(doc) {
        if (!doc) return null;
        const ldJson = doc.querySelector('script[type="application/ld+json"]');
        if (!ldJson) return null;

        let data;
        try {
            data = JSON.parse(ldJson.textContent);
        } catch (e) {
            console.error("KAN: invalid JSON-LD", e);
            return null;
        }
        if (Array.isArray(data)) {
            data = data.find(d => d["@type"] === "VideoObject") || data[0];
        }
        if (!data || (data["@type"] !== "VideoObject" && data["@type"] !== "Video")) return null;

        return {
            title: (data.name && data.name.trim()) || "KAN Video",
            description: (data.description && data.description.trim()) || "",
            thumbnail: data.thumbnailUrl || data.thumbnail || null,
            publishedAt: data.uploadDate || null,
            streams: [
                { url: data.contentUrl, format: "hls", quality: "auto" }
            ]
        };
    }

    // ----------------------------
    // Parse an audio page (MP3) — accepts Document
    // ----------------------------
    async function parseAudioPage(doc) {
        if (!doc) return null;
        const info = doc.querySelector(".audio-episode-info[data-player-src]");
        if (!info) return null;

        const src = info.getAttribute("data-player-src");
        const title = info.getAttribute("data-player-title") || doc.querySelector("h2.title")?.innerText?.trim();
        const description = doc.querySelector(".podcast-content-wrapper .item-content")?.innerText?.trim();
        const thumbnail = doc.querySelector(".audio-episode-info-image-thumbnail")?.src;
        const duration = parseDuration(doc.querySelector(".podcast-content-wrapper ul li")?.innerText);
        const publishedAt = doc.querySelector(".date-local")?.dataset.dateUtc;

        return {
            title,
            description,
            thumbnail,
            duration,
            publishedAt,
            streams: [
                { url: src, format: "audio/mp3", quality: "high" }
            ]
        };
    }

    // ----------------------------
    // Fetch paginated podcast or show pages
    // ----------------------------
    async function fetchPaginated(url, parseFn, maxPages = 5) {
        let page = 1, results = [];
        while (page <= maxPages) {
            const fullUrl = page === 1 ? url : url + `?page=${page}`;
            const doc = await fetchHtml(fullUrl);
            if (!doc) break;
            const items = parseFn(doc);
            if (!items || items.length === 0) break;
            results = results.concat(items);

            // Check if there is a next page
            const nextPageEl = doc.querySelector(".pagination-next__link");
            if (!nextPageEl || nextPageEl.classList.contains("disabled")) break;
            page++;
        }
        console.log("KAN: total paginated items", results.length);
        return results;
    }

    // ----------------------------
    // KAN Plugin Object
    // ----------------------------
    const KANPlugin = {
        name: "KAN",
        version: "1.0.0",

        getShows: async function() {
            console.log("KANPlugin: Loading shows...");
            return await fetchPaginated(BASE + "/lobby/kan-box/", parseShowList, 5);
        },

        getShowEpisodes: async function(showUrl) {
            console.log("KANPlugin: Loading show episodes", showUrl);
            const doc = await fetchHtml(showUrl);
            if (!doc) return [];
            return parsePodcastEpisodes(doc); // reuse podcast parser for episode cards
        },

        getPodcasts: async function() {
            console.log("KANPlugin: Loading podcasts...");
            return await fetchPaginated(BASE + "/podcasts/", parsePodcastEpisodes, 5);
        },

        getPodcastEpisodes: async function(podcastUrl) {
            console.log("KANPlugin: Loading podcast episodes", podcastUrl);
            const doc = await fetchHtml(podcastUrl);
            if (!doc) return [];
            return parsePodcastEpisodes(doc);
        },

        getPlayable: async function(episodeUrl) {
            console.log("KANPlugin: Loading playable", episodeUrl);
            const doc = await fetchHtml(episodeUrl);
            if (!doc) return null;

            if (doc.querySelector('script[type="application/ld+json"]')) {
                return await parseVideoPage(doc);
            }
            if (doc.querySelector(".audio-episode-info[data-player-src]")) {
                return await parseAudioPage(doc);
            }
            return null;
        }
    };

    // Expose on the global object and as module.exports for Grayjay require()
    try {
        const root = (typeof globalThis !== "undefined") ? globalThis : (typeof global !== "undefined" ? global : this);
        root.KANPlugin = KANPlugin;
    } catch (e) { /* ignore */ }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = KANPlugin;
    }

    console.log("KANPlugin loaded.");
})();
