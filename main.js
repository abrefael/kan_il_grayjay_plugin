// ============================
// KAN Grayjay Plugin
// ============================

(function() {
    const BASE = "https://www.kan.org.il";

    // ----------------------------
    // Utility: fetch HTML
    // ----------------------------
    async function fetchHtml(url) {
        try {
            const res = await fetch(url);
            console.log("KAN: fetch", url, res.status);
            if (!res.ok) throw new Error("HTTP error " + res.status);
            const text = await res.text();
            console.log("KAN: fetched HTML length", text.length);
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
    // Parse a video page (JSON-LD)
    // ----------------------------
    async function parseVideoPage(html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const ldJson = doc.querySelector('script[type="application/ld+json"]');
        if (!ldJson) return null;

        let data;
        try {
            data = JSON.parse(ldJson.innerText);
        } catch (e) {
            console.error("KAN: invalid JSON-LD", e);
            return null;
        }
        if (!data || data["@type"] !== "VideoObject") return null;

        return {
            title: data.name?.trim() || "KAN Video",
            description: data.description?.trim() || "",
            thumbnail: data.thumbnailUrl || null,
            publishedAt: data.uploadDate || null,
            streams: [
                { url: data.contentUrl, format: "hls", quality: "auto" }
            ]
        };
    }

    // ----------------------------
    // Parse an audio page (MP3)
    // ----------------------------
    async function parseAudioPage(html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
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
    this.KANPlugin = {
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
                return await parseVideoPage(doc.documentElement.outerHTML);
            }
            if (doc.querySelector(".audio-episode-info[data-player-src]")) {
                return await parseAudioPage(doc.documentElement.outerHTML);
            }
            return null;
        }
    };

    console.log("KANPlugin loaded.");
})();

